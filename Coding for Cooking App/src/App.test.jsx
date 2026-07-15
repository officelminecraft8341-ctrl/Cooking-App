import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

beforeEach(() => {
  localStorage.clear();
});

describe('ChefAI landing experience', () => {
  it('renders the hero heading and main actions', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Cook beautifully, plan effortlessly/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a recipe/i })).toBeInTheDocument();
    expect(screen.getByText(/Premium AI cooking assistant/i)).toBeInTheDocument();
  });

  it('lets the user start a conversation with ChefAI', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/make something italian/i);
    fireEvent.change(input, {
      target: { value: 'Make me a vegan pasta in 15 minutes' },
    });

    expect(input).toHaveValue('Make me a vegan pasta in 15 minutes');
  });

  it('opens the AI creation modal from the hero action', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /create a recipe/i }));

    expect(screen.getByRole('heading', { name: /create a recipe/i })).toBeInTheDocument();
  });

  it('signs a user in from the auth modal', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /open sign in/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'chef@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getAllByText(/welcome back/i).length).toBeGreaterThan(0);
  });

  it('prompts the user to create recipes with AI instead of showing static recipe cards', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText(/ask chefai to create your first recipe/i)).toBeInTheDocument();
    expect(screen.queryByText(/golden tomato pasta/i)).not.toBeInTheDocument();
  });
});
