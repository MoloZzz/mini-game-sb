import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Modal } from '@/components/ui/Modal';

describe('Modal', () => {
  it('exposes an accessible dialog with the given label', () => {
    render(
      <Modal label="Card preview" onClose={() => {}}>
        content
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Card preview' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('uses narrow viewport insets before the desktop dialog padding', () => {
    const { container } = render(
      <Modal label="Card preview" onClose={() => {}}>
        content
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Card preview' });
    expect(container.firstElementChild).toHaveClass('p-3', 'sm:p-6');
    expect(dialog).toHaveClass('p-4', 'sm:p-5');
  });

  it('closes on the close button, on Escape, and on a backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <Modal label="Card preview" onClose={onClose}>
        content
      </Modal>,
    );

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close when the click lands inside the dialog', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal label="Card preview" onClose={onClose} hideCloseButton>
        <p>content</p>
      </Modal>,
    );

    await user.click(screen.getByText('content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('only the topmost dialog reacts to Escape', () => {
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();

    render(
      <>
        <Modal label="Outer" onClose={onCloseOuter}>
          outer
        </Modal>
        <Modal label="Inner" onClose={onCloseInner}>
          inner
        </Modal>
      </>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(
      <Modal label="Card preview" onClose={() => {}} hideCloseButton>
        <button type="button">first</button>
        <button type="button">last</button>
      </Modal>,
    );

    const first = screen.getByRole('button', { name: 'first' });
    const last = screen.getByRole('button', { name: 'last' });

    expect(first).toHaveFocus();
    await user.tab();
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
  });
});
