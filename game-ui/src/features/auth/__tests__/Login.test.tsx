import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';
import { AuthProvider } from '@/lib/authContext';

import { Login } from '../Login';

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetDb();
  window.localStorage.clear();
});
afterAll(() => server.close());

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div>Lobby placeholder</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Login', () => {
  it('surfaces INVALID_CREDENTIALS as a friendly inline error', async () => {
    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), 'nobody@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Incorrect email or password.'),
    );
    // Doesn't navigate away on failure.
    expect(screen.queryByText('Lobby placeholder')).not.toBeInTheDocument();
  });

  it('navigates to the lobby on a successful login with the seeded account', async () => {
    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), 'player@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByText('Lobby placeholder')).toBeInTheDocument());
  });
});
