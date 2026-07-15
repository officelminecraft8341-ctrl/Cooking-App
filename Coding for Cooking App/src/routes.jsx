import { Routes, Route } from 'react-router-dom';
import App from './App';
import RecipePage from './RecipePage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/recipe/:recipeName" element={<RecipePage />} />
    </Routes>
  );
}
