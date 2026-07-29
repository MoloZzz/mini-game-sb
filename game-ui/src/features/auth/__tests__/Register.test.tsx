import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';
import { AuthProvider } from '@/lib/authContext';

import { Register } from '../Register';

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetDb();
  window.localStorage.clear();
});
afterAll(() => server.close());

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<div>Lobby placeholder</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Register', () => {
  it('surfaces EMAIL_TAKEN as a friendly inline error', async () => {
    renderRegister();

    // player@example.com is one of the two accounts seeded in src/mocks/db.ts.
    await userEvent.type(screen.getByLabelText(/display name/i), 'Someone New');
    await userEvent.type(screen.getByLabelText(/email/i), 'player@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'brand-new-password');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('An account with that email already exists.'),
    );
    expect(screen.queryByText('Lobby placeholder')).not.toBeInTheDocument();
  });

  it('navigates to the lobby on a successful registration', async () => {
    renderRegister();

    await userEvent.type(screen.getByLabelText(/display name/i), 'Someone New');
    await userEvent.type(screen.getByLabelText(/email/i), 'someone-new@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'brand-new-password');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(screen.getByText('Lobby placeholder')).toBeInTheDocument());
  });
});
