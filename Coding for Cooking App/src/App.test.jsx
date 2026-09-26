import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
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
    expect(screen.getByText(/Your AI cooking assistant/i)).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /get recipe ideas/i })).toBeInTheDocument();
    expect(screen.getByText(/AI recipe draft/i)).toBeInTheDocument();
  });

  it('signs a user in from the auth modal', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      if (String(url).includes('/auth/login')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'test-token', user: { email: body.email, name: 'Chef' } }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }));

    renderApp();

    fireEvent.click(screen.getByRole('button', { name: /open sign in/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'chef@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument());
    expect(screen.getByText('Chef')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('chefai-auth'))).toMatchObject({ token: 'test-token' });
  });

  it('creates an account, signs out, and returns to the signed-out header', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      if (String(url).includes('/auth/signup')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'new-token', user: { email: body.email, name: body.name } }),
        });
      }
      if (String(url).includes('/auth/logout')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }));

    renderApp();

    fireEvent.click(screen.getByRole('button', { name: /open sign in/i }));
    fireEvent.click(screen.getByRole('button', { name: /create one free/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Ahaan' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ahaan@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'super-secret-9' } });
    fireEvent.click(screen.getByLabelText(/i agree to the terms/i));
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument());
    expect(screen.getByText('Ahaan')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /open sign in/i })).toBeInTheDocument());
    expect(localStorage.getItem('chefai-auth')).toBeNull();
  });

  it('switches the chat recipe context from the saved-recipe picker', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).includes('/recipes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ title: 'Miso Salmon', id: 1 }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }));
    localStorage.setItem('chefai-saved-recipes', JSON.stringify([{ title: 'Miso Salmon', id: 1 }]));

    renderApp();

    fireEvent.click(screen.getByRole('tab', { name: /chat/i }));
    fireEvent.click(screen.getByRole('button', { name: /switch recipe context/i }));
    fireEvent.click(screen.getByRole('option', { name: /miso salmon/i }));

    expect(await screen.findByText(/switched context to “miso salmon”/i)).toBeInTheDocument();
  });

  it('surfaces wrong-password errors from the server', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: 'Incorrect email or password' }),
    })));

    renderApp();

    fireEvent.click(screen.getByRole('button', { name: /open sign in/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'chef@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect email or password/i);
  });

  it('prompts the user to create recipes with AI instead of showing static recipe cards', () => {
    renderApp(['/recipe', '?view=generate']);

    expect(screen.getByText(/tell chefai what you have/i)).toBeInTheDocument();
    expect(screen.queryByText(/golden tomato pasta/i)).not.toBeInTheDocument();
  });

  it('switches accent themes and persists the choice', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: /open appearance settings/i }));
    fireEvent.click(screen.getByRole('radio', { name: /azul accent/i }));

    expect(document.documentElement.getAttribute('data-accent')).toBe('azul');
    expect(JSON.parse(localStorage.getItem('chefai-appearance-settings'))).toMatchObject({ accent: 'azul' });

    fireEvent.click(screen.getByRole('radio', { name: /yellow accent/i }));
    expect(document.documentElement.getAttribute('data-accent')).toBe('yellow');
  });

  it('toggles liquid glass and reflects it on the body', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: /open appearance settings/i }));
    expect(document.body.classList.contains('glass-off')).toBe(false);

    fireEvent.click(screen.getByLabelText(/liquid glass/i));
    expect(document.body.classList.contains('glass-off')).toBe(true);
    expect(JSON.parse(localStorage.getItem('chefai-appearance-settings'))).toMatchObject({ liquidGlass: false });
  });

  it('fetches ideas, then generates the chosen recipe with tutorials', async () => {
    const fetchCalls = [];
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      fetchCalls.push({ url, body: options?.body ? JSON.parse(options.body) : null });
      if (String(url).includes('/recipes/ideas')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ideas: [
              { id: 'simple', title: 'Simple Soup', description: 'Easy.', complexity: 'Simple', time: '20 min', keyTwist: 'One pot' },
              { id: 'intermediate', title: 'Braised Bowl', description: 'Medium.', complexity: 'Intermediate', time: '45 min', keyTwist: 'Braise' },
              { id: 'ambitious', title: 'Tower Dish', description: 'Hard.', complexity: 'Ambitious', time: '90 min', keyTwist: 'Layers' },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ recipe: { title: 'Braised Bowl', description: 'Test', tutorials: { videoQuery: 'braise', articleQuery: 'braise guide', videoUrl: 'https://youtube.com/x', articleUrl: 'https://google.com/y' } } }),
      });
    }));

    renderApp(['/recipe', '?view=generate']);
    fireEvent.change(screen.getByRole('textbox', { name: /^ingredients/i }), { target: { value: 'chicken' } });
    fireEvent.click(screen.getByRole('button', { name: /get recipe ideas/i }));

    await screen.findByRole('dialog', { name: /choose a dish concept/i });
    expect(screen.getByText('Simple Soup')).toBeInTheDocument();
    expect(screen.getByText('Tower Dish')).toBeInTheDocument();
    expect(fetchCalls.some((c) => c.url.includes('/recipes/ideas'))).toBe(true);

    const ideaCards = screen.getAllByRole('button', { name: /make this/i });
    fireEvent.click(ideaCards.find((card) => card.textContent.includes('Braised Bowl')));
    await screen.findByRole('dialog', { name: /recipe: braised bowl/i });

    const genCall = fetchCalls.find((c) => c.url.includes('/recipes/generate'));
    expect(genCall.body.idea.ideaTitle).toBe('Braised Bowl');
    expect(screen.getByText('Watch a video tutorial')).toBeInTheDocument();
    expect(screen.getByText('Read an in-depth guide')).toBeInTheDocument();

    vi.unstubAllGlobals();
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
