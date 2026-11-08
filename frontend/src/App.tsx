import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { homeFor, RequireRole, STAFF, useAuth } from './lib/auth';
import { PublicLayout } from './components/PublicLayout';
import { StaffLayout } from './components/StaffLayout';
import { Loading } from './components/ui';
import { Login, Register } from './pages/Auth';
import { JobBoard } from './pages/JobBoard';
import { JobDetail } from './pages/JobDetail';
import { Portal } from './pages/portal/Portal';
import { JobsAdmin } from './pages/staff/JobsAdmin';
import { Pipeline } from './pages/staff/Pipeline';
import { Workflow } from './pages/staff/Workflow';
import { ApplicationDetail } from './pages/staff/ApplicationDetail';
import { Interviews } from './pages/staff/Interviews';
import { Approvals } from './pages/staff/Approvals';
import { Templates } from './pages/staff/Templates';
import { Governance } from './pages/staff/Governance';
import { Audit } from './pages/staff/Audit';
import { Users } from './pages/staff/Users';

// Recharts is heavy; load it only when the dashboard is opened.
const Dashboard = lazy(() => import('./pages/staff/Dashboard').then((m) => ({ default: m.Dashboard })));

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={user ? homeFor(user) : '/jobs'} replace />;
}

const staff = (el: React.ReactNode, roles = STAFF) => <RequireRole roles={roles}>{el}</RequireRole>;

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route element={<PublicLayout />}>
        <Route path="/jobs" element={<JobBoard />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/portal/*" element={<RequireRole roles={['CANDIDATE']}><Portal /></RequireRole>} />
      </Route>
      <Route element={staff(<StaffLayout />)}>
        <Route path="/dashboard" element={<Suspense fallback={<Loading />}><Dashboard /></Suspense>} />
        <Route path="/jobs-admin" element={<JobsAdmin />} />
        <Route path="/jobs-admin/:id/pipeline" element={<Pipeline />} />
        <Route path="/jobs-admin/:id/workflow" element={staff(<Workflow />, ['EMPLOYER', 'RECRUITER'])} />
        <Route path="/applications/:id" element={<ApplicationDetail />} />
        <Route path="/interviews" element={<Interviews />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/templates" element={staff(<Templates />, ['EMPLOYER', 'RECRUITER'])} />
        <Route path="/governance" element={staff(<Governance />, ['EMPLOYER'])} />
        <Route path="/audit" element={staff(<Audit />, ['EMPLOYER', 'RECRUITER'])} />
        <Route path="/users" element={staff(<Users />, ['EMPLOYER'])} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
