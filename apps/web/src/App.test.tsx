import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('WardPilot identity screen', () => {
  it('renders sign-in and supports switching to workspace registration', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(screen.getByRole('heading', { name: 'Create your workspace' })).toBeInTheDocument();
    expect(screen.getByLabelText('Organization name')).toBeInTheDocument();
  });
});
