import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import GeneratePage from "./pages/GeneratePage";
import ResultsPage from "./pages/ResultsPage";
import EvalPage from "./pages/EvalPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<HomePage />} />
        <Route path="/generate"  element={<GeneratePage />} />
        <Route path="/results"   element={<ResultsPage />} />
        <Route path="/eval"      element={<EvalPage />} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

