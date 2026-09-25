import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

function renderApp(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('ChefAI app shell', () => {
  it('renders the home view with hero heading and main actions', () => {
    renderApp();

    expect(screen.getByRole('heading', { name: /Cook beautifully, plan effortlessly/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a recipe/i })).toBeInTheDocument();
    expect(screen.getByText(/Premium AI cooking assistant/i)).toBeInTheDocument();
  });

  it('switches to the generator view from the create a recipe action', () => {
    renderApp();

    fireEvent.click(screen.getAllByRole('button', { name: /create a recipe/i })[0]);

    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-generate');
    expect(screen.getByRole('heading', { name: /create a recipe/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^ingredients/i })).toBeInTheDocument();
  });

  it('switches views via the header pill tabs', () => {
    renderApp();

    fireEvent.click(screen.getByRole('tab', { name: /saved/i }));

    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-saved');
    expect(screen.getByRole('tab', { name: /saved/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Nothing saved yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /chat/i }));
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-chat');
    expect(screen.getByPlaceholderText(/ask chefai anything about cooking/i)).toBeInTheDocument();
  });

  it('navigates views with the arrow keys', () => {
    renderApp();

    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-home');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-generate');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-chat');

    // Does not overflow past the last view
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-chat');

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-saved');
  });

  it('does not switch views when typing in an input', () => {
    renderApp();

    fireEvent.click(screen.getAllByRole('button', { name: /create a recipe/i })[0]);
    const ingredientsInput = screen.getByRole('textbox', { name: /^ingredients/i });

    fireEvent.keyDown(ingredientsInput, { key: 'ArrowRight' });
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-generate');
  });

  it('deep-links to a view through the ?view= query param', () => {
    renderApp(['/recipe', '?view=chat']);

    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-chat');
  });

  it('ignores an invalid ?view= query param and lands on home', () => {
    renderApp(['/recipe', '?view=nonsense']);

    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-home');
  });

  it('applies accessibility preferences from the accessibility panel', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: /open accessibility options/i }));
    fireEvent.click(screen.getByLabelText(/high contrast/i));
    fireEvent.click(screen.getByLabelText(/large text/i));

    expect(document.body.classList.contains('accessibility-high-contrast')).toBe(true);
    expect(document.body.classList.contains('accessibility-large-text')).toBe(true);
    expect(JSON.parse(localStorage.getItem('chefai-accessibility-settings'))).toMatchObject({
      highContrast: true,
      largeText: true,
    });
  });

  it('lets the user start a conversation with ChefAI', () => {
    renderApp(['/recipe', '?view=chat']);

    const input = screen.getByPlaceholderText(/ask chefai anything about cooking/i);
    fireEvent.change(input, {
      target: { value: 'Make me a vegan pasta in 15 minutes' },
    });

    expect(input).toHaveValue('Make me a vegan pasta in 15 minutes');
  });

  it('shows the full generator form in the generator view', () => {
    renderApp(['/recipe', '?view=generate']);

    expect(screen.getByRole('textbox', { name: /^ingredients/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/dietary need/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cook time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/servings/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate recipe/i })).toBeInTheDocument();
    expect(screen.getByText(/AI recipe draft/i)).toBeInTheDocument();
  });

  it('signs a user in from the auth modal', () => {
    renderApp();

    fireEvent.click(screen.getByRole('tab', { name: /chat/i }));
    fireEvent.click(screen.getByRole('button', { name: /open sign in/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'chef@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getAllByText(/welcome back/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'view-panel-chat');
  });

  it('prompts the user to create recipes with AI instead of showing static recipe cards', () => {
    renderApp(['/recipe', '?view=generate']);

    expect(screen.getByText(/tell chefai what you have/i)).toBeInTheDocument();
    expect(screen.queryByText(/golden tomato pasta/i)).not.toBeInTheDocument();
  });

  it('keeps generator input when switching views and returning', () => {
    renderApp();

    fireEvent.click(screen.getAllByRole('button', { name: /create a recipe/i })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: /^ingredients/i }), {
      target: { value: 'chicken, garlic, lemon' },
    });

    fireEvent.click(screen.getByRole('tab', { name: /saved/i }));
    fireEvent.click(screen.getByRole('tab', { name: /generate/i }));

    expect(screen.getByRole('textbox', { name: /^ingredients/i })).toHaveValue('chicken, garlic, lemon');
  });
});
