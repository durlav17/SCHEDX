import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/Shell";
import { Spinner } from "./components/ui";
import HomePage from "./pages/HomePage";
import { LabProvider } from "./state/LabContext";

const LabPage = lazy(() => import("./pages/LabPage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const ReplayPage = lazy(() => import("./pages/ReplayPage"));
const WhatIfPage = lazy(() => import("./pages/WhatIfPage"));
const ExperimentsPage = lazy(() => import("./pages/ExperimentsPage"));
const LearnPage = lazy(() => import("./pages/LearnPage"));
const ResearchPage = lazy(() => import("./pages/ResearchPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const ArchitecturePage = lazy(() => import("./pages/ArchitecturePage"));
const DocsPage = lazy(() => import("./pages/DocsPage"));

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="font-mono text-sm text-fg-faint">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="mt-4 inline-block text-cyan-300 hover:underline">Back to SchedX home</Link>
    </div>
  );
}

const shell = (el: React.ReactNode) => (
  <AppShell><Suspense fallback={<Spinner label="Loading…" />}>{el}</Suspense></AppShell>
);

export default function App() {
  return (
    <BrowserRouter>
      <LabProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lab" element={shell(<LabPage />)} />
          <Route path="/compare" element={shell(<ComparePage />)} />
          <Route path="/replay" element={shell(<ReplayPage />)} />
          <Route path="/what-if" element={shell(<WhatIfPage />)} />
          <Route path="/experiments" element={shell(<ExperimentsPage />)} />
          <Route path="/learn" element={shell(<LearnPage />)} />
          <Route path="/research" element={shell(<ResearchPage />)} />
          <Route path="/about" element={shell(<AboutPage />)} />
          <Route path="/architecture" element={shell(<ArchitecturePage />)} />
          <Route path="/docs" element={shell(<DocsPage />)} />
          <Route path="*" element={shell(<NotFound />)} />
        </Routes>
      </LabProvider>
    </BrowserRouter>
  );
}
