import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';
describe('WardPilot landing page', () => {
  it('renders the product identity and foundation status', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /clarity for complex hospital operations/i })).toBeInTheDocument();
    expect(screen.getByText('API foundation')).toBeInTheDocument();
    expect(screen.getByText('Operational modules')).toBeInTheDocument();
  });
});
