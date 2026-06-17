import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardApp from './DashboardApp';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { configured, loading, session } = useAuth();

  if (!configured) {
    return <Navigate to="/login" replace />;
  }
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { configured, loading, session } = useAuth();

  if (!configured) {
    return children;
  }
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }
  if (session) {
    return <Navigate to="/app" replace />;
  }
  return children;
}

function AppRoutes() {
  const { configured } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnlyRoute>
            <SignupPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/app"
        element={
          configured ? (
            <ProtectedRoute>
              <DashboardApp />
            </ProtectedRoute>
          ) : (
            <DashboardApp />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
