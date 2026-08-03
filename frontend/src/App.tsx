import { UserButton } from '@clerk/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Circle,
  FileText,
  KeyRound,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Play,
  Settings,
  UploadCloud,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { ClerkAuthProvider } from './auth/clerk-auth-provider';
import { usePortalAuth } from './auth/auth-context';
import { getAuthMode } from './auth/env';
import { MockAuthProvider } from './auth/mock-auth-provider';
import { COURSES, getCourseById } from './config/courses';
import { PRODUCT } from './config/product';
import { MuxVideoPlayer, type MediaProgressEvent } from './components/MuxVideoPlayer';
import { PdfDocumentViewer } from './components/PdfDocumentViewer';
import { AdminResourceManager } from './components/AdminResourceManager';
import { useEntitlements, useRedeemAccessCode } from './hooks/use-entitlements';
import {
  useCourseProgressActions,
  useResourceProgress,
  useResourceProgressActions,
} from './hooks/use-resource-progress';
import { useCurrentUser } from './hooks/use-current-user';
import { useResources } from './hooks/use-resources';
import {
  getMuxPlaybackToken,
  getMuxThumbnailToken,
  getPaidStorageUrl,
  getPdfThumbnailUrl,
  getPublicStorageUrl,
} from './lib/api';
import { muxSignedThumbnailUrl, muxThumbnailUrl } from './lib/mux';
import type { CourseDefinition, Resource, ResourceProgress, ResourceType } from './types';

const queryClient = new QueryClient();

type CourseTab = 'overview' | 'resources' | 'videos';

interface HashRoute {
  path: string;
  search: URLSearchParams;
}

function parseHash(): HashRoute {
  const rawHash = window.location.hash.replace(/^#/, '') || '/dashboard';
  const normalized = rawHash.startsWith('/') ? rawHash : `/${rawHash}`;
  const [path, query = ''] = normalized.split('?');
  return { path, search: new URLSearchParams(query) };
}

function useHashRoute() {
  const [route, setRoute] = useState<HashRoute>(() => parseHash());

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

function routeHref(path: string, search?: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(search ?? {}).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const queryString = query.toString();
  return `#${path}${queryString ? `?${queryString}` : ''}`;
}

function navigate(path: string, search?: Record<string, string | undefined>) {
  window.location.hash = routeHref(path, search).slice(1);
}

function pathParts(route: HashRoute) {
  return route.path.split('/').filter(Boolean);
}

function AppProviders({ children }: { children: ReactNode }) {
  const mode = getAuthMode();
  const inner = (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );

  return mode === 'mock' ? <MockAuthProvider>{inner}</MockAuthProvider> : <ClerkAuthProvider>{inner}</ClerkAuthProvider>;
}

export default function App() {
  return (
    <AppProviders>
      <DashboardApp />
    </AppProviders>
  );
}

function DashboardApp() {
  const route = useHashRoute();
  const { isLoaded } = usePortalAuth();

  if (!isLoaded) {
    return <div className="page-loader">Loading...</div>;
  }

  if (route.path === '/login') {
    return <LoginPage />;
  }

  return (
    <DashboardShell route={route}>
      <RouteContent route={route} />
    </DashboardShell>
  );
}

function RouteContent({ route }: { route: HashRoute }) {
  const parts = pathParts(route);

  if (parts[0] === 'course' && parts[1]) {
    const tab = parts[2] === 'resources' || parts[2] === 'videos' ? parts[2] : 'overview';
    return <CoursePage courseId={parts[1]} tab={tab} moduleId={route.search.get('module') ?? undefined} />;
  }

  if (parts[0] === 'resource' && parts[1]) {
    return <ResourceDetailPage resourceId={parts[1]} route={route} />;
  }

  if (parts[0] === 'settings') {
    return <SettingsPage />;
  }

  if (parts[0] === 'admin' && parts[1] === 'resources') {
    return <AdminResourcesPage />;
  }

  return <DashboardHome />;
}

function DashboardShell({ route, children }: { route: HashRoute; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className="sidebar desktop-only">
        <SidebarContent route={route} />
      </aside>

      {mobileOpen && (
        <div className="mobile-drawer" role="dialog" aria-label="Dashboard navigation">
          <div className="mobile-drawer-panel">
            <button className="icon-button drawer-close" type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            <SidebarContent route={route} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="main-column">
        <header className="mobile-topbar">
          <button className="icon-button" type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <span>{PRODUCT.name}</span>
        </header>
        <div className="support-banner">
          <span>Need help with course access?</span>
          <a href={`mailto:${PRODUCT.supportEmail}`}>
            <Mail size={14} />
            Contact support
          </a>
        </div>
        {children}
      </div>
    </div>
  );
}

function SidebarContent({ route, onNavigate }: { route: HashRoute; onNavigate?: () => void }) {
  const { hasCourseAccess } = useEntitlements();
  const currentUser = useCurrentUser();
  const parts = pathParts(route);
  const currentCourseId = parts[0] === 'course' ? parts[1] : route.search.get('courseId') ?? undefined;
  const selectedModule = route.search.get('module') ?? undefined;
  const isAdmin = currentUser.data?.role === 'ADMIN';

  return (
    <>
      <div className="brand-block">
        <div className="brand-mark" aria-hidden>
          <BookOpen size={18} />
        </div>
        <div>
          <strong>{PRODUCT.name}</strong>
          <span>Course dashboard</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Dashboard">
        <a className={route.path === '/dashboard' ? 'nav-link active' : 'nav-link'} href="#/dashboard" onClick={onNavigate}>
          <BarChart3 size={16} />
          Dashboard
        </a>

        {COURSES.map((course) => {
          const locked = !hasCourseAccess(course.id);
          const active = currentCourseId === course.id;
          return (
            <div key={course.id} className="nav-group">
              <a
                className={active ? 'nav-link active' : 'nav-link'}
                href={routeHref(`/course/${course.id}`)}
                onClick={onNavigate}
              >
                {locked ? <LockKeyhole size={16} /> : <BookOpen size={16} />}
                <span>{course.shortLabel}: {course.title}</span>
              </a>
              {active && !locked && (
                <div className="nav-subgroup">
                  <a className={route.path.endsWith('/resources') ? 'nav-sublink active' : 'nav-sublink'} href={routeHref(`/course/${course.id}/resources`)} onClick={onNavigate}>
                    <FileText size={14} />
                    Resources
                  </a>
                  <a className={route.path.endsWith('/videos') && !selectedModule ? 'nav-sublink active' : 'nav-sublink'} href={routeHref(`/course/${course.id}/videos`)} onClick={onNavigate}>
                    <Video size={14} />
                    Videos
                  </a>
                  {course.modules?.map((module) => (
                    <a
                      key={module.id}
                      className={selectedModule === module.id ? 'nav-sublink nested active' : 'nav-sublink nested'}
                      href={routeHref(`/course/${course.id}/videos`, { module: module.id })}
                      onClick={onNavigate}
                    >
                      {module.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <a className={route.path === '/settings' ? 'nav-link active' : 'nav-link'} href="#/settings" onClick={onNavigate}>
          <Settings size={16} />
          Settings
        </a>

        {isAdmin && (
          <a
            className={route.path === '/admin/resources' ? 'nav-link active' : 'nav-link'}
            href="#/admin/resources"
            onClick={onNavigate}
          >
            <UploadCloud size={16} />
            Resource Manager
          </a>
        )}
      </nav>

      <AccountControl />
    </>
  );
}

function AccountControl() {
  const { isSignedIn, signIn, signOut, user } = usePortalAuth();
  const usesClerk = getAuthMode() === 'clerk';
  const usesMockAuth = getAuthMode() === 'mock';
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Account';

  if (!isSignedIn) {
    return (
      <button
        className="account-button"
        type="button"
        onClick={() => (usesMockAuth ? navigate('/login') : void signIn())}
      >
        <LogIn size={16} />
        Sign in
      </button>
    );
  }

  return (
    <div className="account-row">
      {usesClerk ? <UserButton /> : <div className="avatar">{displayName.slice(0, 1).toUpperCase()}</div>}
      <div className="account-copy">
        <strong>{displayName}</strong>
        {user?.email && <span>{user.email}</span>}
      </div>
      <button className="icon-button" type="button" onClick={() => void signOut()} aria-label="Sign out">
        <LogOut size={16} />
      </button>
      {usesMockAuth && (
        <button className="account-switch-button" type="button" onClick={() => navigate('/login')}>
          <LogIn size={15} />
          Switch learner
        </button>
      )}
    </div>
  );
}

function AdminResourcesPage() {
  const currentUser = useCurrentUser();

  if (currentUser.isLoading) {
    return (
      <main className="page narrow">
        <p className="muted">Checking admin access...</p>
      </main>
    );
  }

  if (currentUser.data?.role !== 'ADMIN') {
    return (
      <main className="page narrow">
        <section className="empty-state align-left">
          <h1>Admin access required</h1>
          <p>Use the mock Admin Preview persona or sign in with an ADMIN account.</p>
          <a className="secondary-button fit" href="#/dashboard">
            Back to dashboard
          </a>
        </section>
      </main>
    );
  }

  return <AdminResourceManager />;
}

function LoginPage() {
  const { isSignedIn, signIn } = usePortalAuth();
  const mode = getAuthMode();

  useEffect(() => {
    if (mode === 'clerk' && isSignedIn) navigate('/dashboard');
  }, [isSignedIn, mode]);

  const chooseMockPersona = async (tier: 'free' | 'paid' | 'admin') => {
    queryClient.removeQueries({ queryKey: ['entitlements'] });
    queryClient.removeQueries({ queryKey: ['resource-progress'] });
    await signIn(tier);
    navigate('/dashboard');
  };

  if (mode === 'clerk') {
    return (
      <main className="login-page">
        <section className="login-panel">
          <h1>Sign in to {PRODUCT.name}</h1>
          <p>Use Clerk for production accounts, saved progress, access-code redemption, and paid course access.</p>
          <button className="primary-button" type="button" onClick={() => void signIn()}>
            <LogIn size={16} />
            Continue with Clerk
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-panel wide">
        <h1>Preview {PRODUCT.name}</h1>
        <p>Choose a mock persona. No real account or backend is required.</p>
        <div className="persona-grid">
          <button className="persona-card" type="button" onClick={() => void chooseMockPersona('free')}>
            <BookOpen size={22} />
            <strong>Free Learner</strong>
            <span>Course 1 only</span>
          </button>
          <button className="persona-card" type="button" onClick={() => void chooseMockPersona('paid')}>
            <KeyRound size={22} />
            <strong>Paid Learner</strong>
            <span>All course content</span>
          </button>
          <button className="persona-card" type="button" onClick={() => void chooseMockPersona('admin')}>
            <Settings size={22} />
            <strong>Admin Preview</strong>
            <span>All course content</span>
          </button>
        </div>
      </section>
    </main>
  );
}

function DashboardHome() {
  const { isSignedIn, user } = usePortalAuth();
  const firstName = user?.firstName ?? user?.email?.split('@')[0] ?? null;

  return (
    <main className="page">
      <section className="page-header">
        <p className="eyebrow">Learning Dashboard</p>
        <h1>{firstName ? `Welcome back, ${firstName}` : 'Choose a course'}</h1>
        <p>Start with a course, continue a saved resource, or redeem an access code from Settings.</p>
      </section>

      <section className="course-grid" aria-label="Courses">
        {COURSES.map((course) => (
          <CourseOverviewCard key={course.id} course={course} />
        ))}
      </section>

      {isSignedIn && (
        <section className="section-block">
          <h2>Saved Progress</h2>
          <DashboardProgressOverview />
        </section>
      )}
    </main>
  );
}

function CourseOverviewCard({ course }: { course: CourseDefinition }) {
  const { hasCourseAccess } = useEntitlements();
  const locked = !hasCourseAccess(course.id);

  return (
    <article className={locked ? 'course-card locked' : 'course-card'}>
      <div className="course-card-icon">{locked ? <LockKeyhole size={20} /> : <BookOpen size={20} />}</div>
      <p>{course.shortLabel}</p>
      <h2>{course.title}</h2>
      <span>{course.description}</span>
      <a className={locked ? 'secondary-button fit' : 'primary-button fit'} href={routeHref(`/course/${course.id}`)}>
        {locked ? 'View Access Options' : 'Open Course'}
      </a>
    </article>
  );
}

function DashboardProgressOverview() {
  const { resources } = useResources();
  const { progress, isLoading } = useResourceProgress();
  const { hasCourseAccess } = useEntitlements();

  if (isLoading) return <p className="muted">Loading progress...</p>;

  return (
    <div className="progress-grid">
      {COURSES.map((course) => {
        const summary = courseCompletion(course.id, resources, progress);
        const locked = !hasCourseAccess(course.id);
        return (
          <a
            key={course.id}
            className={locked ? 'progress-tile locked' : 'progress-tile'}
            href={locked ? '#/settings' : routeHref(`/course/${course.id}`)}
          >
            <span>{course.shortLabel}</span>
            <strong>{course.title}</strong>
            {locked ? (
              <p><LockKeyhole size={14} /> Redeem or purchase to unlock.</p>
            ) : (
              <>
                <div className="progress-meta">
                  <span>Completed</span>
                  <span>{summary.completed} / {summary.total}</span>
                </div>
                <ProgressBar value={summary.percent} />
              </>
            )}
          </a>
        );
      })}
    </div>
  );
}

function CoursePage({ courseId, tab, moduleId }: { courseId: string; tab: CourseTab; moduleId?: string }) {
  const course = getCourseById(courseId);
  const { hasCourseAccess, isLoading } = useEntitlements();

  if (!course) {
    return (
      <main className="page narrow">
        <p className="muted">Course not found.</p>
        <a className="secondary-button fit" href="#/dashboard">Back to dashboard</a>
      </main>
    );
  }

  const selectedModule = course.modules?.find((module) => module.id === moduleId);
  const locked = !isLoading && !hasCourseAccess(course.id);

  return (
    <main className="page">
      <CourseHeader course={course} tab={tab} selectedModule={selectedModule?.title} />

      {locked ? (
        <LockedCourseAccess course={course} />
      ) : tab === 'videos' && course.modules?.length && !moduleId ? (
        <div className="section-stack">
          <ResourceSection title="Course Videos" courseId={course.id} resourceTypes={['video']} moduleId={null} origin="videos" />
          {course.modules.map((module) => (
            <ResourceSection
              key={module.id}
              title={module.title}
              courseId={course.id}
              resourceTypes={['video']}
              moduleId={module.id}
              origin="videos"
            />
          ))}
        </div>
      ) : (
        <ResourceSection
          title={tabLabel(tab, selectedModule?.title)}
          courseId={course.id}
          resourceTypes={tab === 'videos' ? ['video'] : tab === 'resources' ? ['pdf', 'article', 'module'] : ['video', 'pdf', 'article', 'module']}
          moduleId={moduleId}
          origin={tab}
        />
      )}
    </main>
  );
}

function CourseHeader({
  course,
  tab,
  selectedModule,
}: {
  course: CourseDefinition;
  tab: CourseTab;
  selectedModule?: string;
}) {
  const { isSignedIn } = usePortalAuth();
  const { resources } = useResources();
  const { progress } = useResourceProgress();
  const summary = courseCompletion(course.id, resources, progress);
  const resourceIds = resources.filter((resource) => resource.courseId === course.id).map((resource) => resource.id);
  const { resetCourseProgress } = useCourseProgressActions(course.id, resourceIds);

  const onReset = () => {
    if (!window.confirm(`Reset progress for ${course.title}?`)) return;
    resetCourseProgress.mutate(undefined, {
      onSuccess: () => toast.success('Course progress reset'),
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to reset progress'),
    });
  };

  return (
    <header className="page-header course-header">
      <div>
        <p className="eyebrow">{course.shortLabel}</p>
        <h1>{course.title}</h1>
        <p>{selectedModule ?? tabLabel(tab)}</p>
      </div>
      <div className="header-actions">
        <a className="secondary-button" href="#/dashboard">Dashboard</a>
      </div>
      {isSignedIn && summary.total > 0 && (
        <div className="course-progress-row">
          <div className="progress-meta">
            <span>Course progress</span>
            <span>{summary.completed} / {summary.total} complete</span>
          </div>
          <ProgressBar value={summary.percent} />
          <button className="secondary-button compact" type="button" onClick={onReset} disabled={resetCourseProgress.isPending}>
            Reset
          </button>
        </div>
      )}
    </header>
  );
}

function ResourceSection({
  title,
  courseId,
  resourceTypes,
  moduleId,
  origin,
}: {
  title: string;
  courseId: string;
  resourceTypes: readonly ResourceType[];
  moduleId?: string | null;
  origin: CourseTab;
}) {
  return (
    <section className="section-block">
      <h2>{title}</h2>
      <DashboardResourceGrid courseId={courseId} resourceTypes={resourceTypes} moduleId={moduleId} origin={origin} />
    </section>
  );
}

function DashboardResourceGrid({
  courseId,
  resourceTypes,
  moduleId,
  origin,
}: {
  courseId: string;
  resourceTypes: readonly ResourceType[];
  moduleId?: string | null;
  origin: CourseTab;
}) {
  const { resources, isLoading, error } = useResources();
  const { hasCourseAccess, isLoading: entitlementsLoading } = useEntitlements();
  const { progressByResourceId, isLoading: progressLoading } = useResourceProgress();
  const { isSignedIn } = usePortalAuth();
  const typeSet = useMemo(() => new Set(resourceTypes), [resourceTypes]);

  const filtered = useMemo(
    () =>
      resources
        .filter(
          (resource) =>
            resource.courseId === courseId &&
            typeSet.has(resource.type) &&
            (moduleId === undefined || (moduleId === null ? !resource.moduleId : resource.moduleId === moduleId)),
        )
        .sort((a, b) => {
          const typeOrder: Partial<Record<ResourceType, number>> = { pdf: 0, video: 1, article: 2, module: 3 };
          return (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || a.title.localeCompare(b.title);
        }),
    [courseId, moduleId, resources, typeSet],
  );

  if (isLoading || entitlementsLoading || (isSignedIn && progressLoading)) return <p className="muted">Loading resources...</p>;
  if (error) return <p className="error">{error instanceof Error ? error.message : 'Unable to load resources'}</p>;
  if (filtered.length === 0) return <p className="muted">No content has been added here yet.</p>;

  return (
    <ul className="resource-grid">
      {filtered.map((resource) => (
        <ResourceCard
          key={resource.id}
          resource={resource}
          locked={resource.access === 'paid' && !hasCourseAccess(resource.courseId)}
          progress={progressByResourceId.get(resource.id)}
          origin={origin}
          moduleId={typeof moduleId === 'string' ? moduleId : undefined}
        />
      ))}
    </ul>
  );
}

function ResourceCard({
  resource,
  locked,
  progress,
  origin,
  moduleId,
}: {
  resource: Resource;
  locked: boolean;
  progress?: ResourceProgress;
  origin: CourseTab;
  moduleId?: string;
}) {
  const link = routeHref(`/resource/${resource.id}`, {
    from: origin,
    courseId: resource.courseId,
    module: moduleId,
  });

  return (
    <li className="resource-card">
      <a className="thumbnail-link" href={locked ? PRODUCT.checkoutUrl : link} target={locked ? '_blank' : undefined} rel={locked ? 'noopener noreferrer' : undefined}>
        <ResourceThumbnail resource={resource} locked={locked} />
      </a>
      <div className="resource-card-body">
        <div className="resource-title-row">
          <a href={locked ? PRODUCT.checkoutUrl : link} target={locked ? '_blank' : undefined} rel={locked ? 'noopener noreferrer' : undefined}>
            {resource.title}
          </a>
          {locked && <LockKeyhole size={15} aria-label="Locked" />}
        </div>
        <p className="topic">{resource.topic}</p>
        <p className="description">{resource.description}</p>
        {resource.duration && <p className="duration">{resource.duration}</p>}
        {progress && (progress.completed || progress.progressPercent > 0) && (
          <div className="card-progress">
            <div className="progress-meta">
              <span>{progress.completed ? 'Complete' : 'In progress'}</span>
              {!progress.completed && <span>{progress.progressPercent}%</span>}
            </div>
            {!progress.completed && <ProgressBar value={progress.progressPercent} />}
          </div>
        )}
        <span className="badge">{resource.type.toUpperCase()}</span>
      </div>
    </li>
  );
}

function ResourceThumbnail({ resource, locked }: { resource: Resource; locked: boolean }) {
  const { getToken } = usePortalAuth();
  const videoToken = useQuery({
    queryKey: ['mux-thumbnail-token', resource.id],
    enabled: resource.type === 'video' && !locked && Boolean(resource.muxPlaybackId && resource.muxPlaybackSigned && !resource.thumbnailUrl),
    queryFn: () => getMuxThumbnailToken(resource.id, getToken),
    staleTime: 50 * 60 * 1000,
  });
  const pdfThumbnail = useQuery({
    queryKey: ['pdf-thumbnail-url', resource.id],
    enabled: resource.type === 'pdf' && !locked && Boolean(resource.bucket && resource.filePath && !resource.thumbnailUrl),
    queryFn: () => getPdfThumbnailUrl(resource.id, getToken),
    staleTime: 14 * 60 * 1000,
  });

  const videoUrl =
    resource.thumbnailUrl ??
    (resource.muxPlaybackId && !resource.muxPlaybackSigned
      ? muxThumbnailUrl(resource.muxPlaybackId)
      : resource.muxPlaybackId && videoToken.data?.token
        ? muxSignedThumbnailUrl(resource.muxPlaybackId, videoToken.data.token)
        : undefined);
  const pdfUrl = resource.thumbnailUrl ?? pdfThumbnail.data?.url;

  if (resource.type === 'video') {
    return (
      <div className="thumbnail">
        {videoUrl && !locked ? <img src={videoUrl} alt={`Preview for ${resource.title}`} /> : <Video size={26} />}
        <span className="play-chip"><Play size={16} fill="currentColor" /></span>
      </div>
    );
  }

  if (resource.type === 'pdf') {
    return <div className="thumbnail">{pdfUrl && !locked ? <img src={pdfUrl} alt={`Preview for ${resource.title}`} /> : <FileText size={28} />}</div>;
  }

  return <div className="thumbnail"><BookOpen size={28} /></div>;
}

function ResourceDetailPage({ resourceId, route }: { resourceId: string; route: HashRoute }) {
  const { resources } = useResources();
  const { hasCourseAccess, isLoading: entitlementsLoading } = useEntitlements();
  const { progressByResourceId } = useResourceProgress();
  const { getToken, isSignedIn } = usePortalAuth();
  const { updateProgress, completeResource, incompleteResource } = useResourceProgressActions(resourceId);
  const lastVideoSaveRef = useRef(0);
  const videoCompletionSaveRef = useRef<string | null>(null);
  const lastPdfSaveRef = useRef(0);
  const lastPdfSignatureRef = useRef<string | null>(null);
  const resource = resources.find((item) => item.id === resourceId) ?? null;
  const canAccess = resource ? resource.access !== 'paid' || hasCourseAccess(resource.courseId) : false;
  const progress = resource ? progressByResourceId.get(resource.id) : undefined;
  const completed = Boolean(progress?.completed);
  const progressPercent = progress?.progressPercent ?? 0;

  const muxToken = useQuery({
    queryKey: ['mux-playback-token', resourceId],
    enabled: Boolean(resource?.type === 'video' && canAccess && resource.muxPlaybackId && resource.muxPlaybackSigned),
    queryFn: () => getMuxPlaybackToken(resourceId, getToken),
    staleTime: 50 * 60 * 1000,
  });

  const publicUrl = useQuery({
    queryKey: ['resource-public-url', resourceId],
    enabled: Boolean(resource?.type === 'pdf' && canAccess && resource.access !== 'paid' && resource.bucket && resource.filePath && !resource.contentUrl),
    queryFn: () => getPublicStorageUrl(resourceId, getToken),
  });

  const paidUrl = useQuery({
    queryKey: ['resource-paid-url', resourceId],
    enabled: Boolean(resource?.type === 'pdf' && canAccess && resource.access === 'paid' && resource.bucket && resource.filePath && !resource.contentUrl),
    queryFn: () => getPaidStorageUrl(resourceId, getToken),
    staleTime: 50 * 60 * 1000,
  });

  useEffect(() => {
    if (!resource?.id || !completed) videoCompletionSaveRef.current = null;
  }, [completed, resource?.id]);

  const backHref = useMemo(() => {
    const courseId = route.search.get('courseId') ?? resource?.courseId ?? 'course-1';
    const from = route.search.get('from');
    const moduleId = route.search.get('module') ?? resource?.moduleId ?? undefined;
    if (from === 'videos') return routeHref(`/course/${courseId}/videos`, { module: moduleId });
    if (from === 'overview') return routeHref(`/course/${courseId}`, { module: moduleId });
    return routeHref(`/course/${courseId}/resources`, { module: moduleId });
  }, [resource, route.search]);

  const saveVideoProgress = useCallback(
    (event: MediaProgressEvent, options: { force?: boolean; completionSource?: ResourceProgress['completionSource'] } = {}) => {
      if (!isSignedIn || !resource || !canAccess || resource.type !== 'video' || completed) return;
      const media = event.currentTarget ?? event.target;
      const currentTime = Number(media?.currentTime ?? 0);
      const duration = Number(media?.duration ?? 0);
      if (!Number.isFinite(currentTime) || currentTime < 0) return;
      const hasDuration = Number.isFinite(duration) && duration > 0;
      const nextPercent = hasDuration ? Math.min(100, Math.round((currentTime / duration) * 100)) : progressPercent;
      const completionSource = options.completionSource ?? (nextPercent >= 90 ? 'video_threshold' : undefined);
      if (completionSource) {
        if (videoCompletionSaveRef.current === resource.id) return;
        videoCompletionSaveRef.current = resource.id;
      }
      const now = Date.now();
      if (!options.force && !completionSource && now - lastVideoSaveRef.current < 10_000) return;
      lastVideoSaveRef.current = now;
      updateProgress.mutate({
        progressPercent: nextPercent,
        lastPositionSeconds: Math.floor(currentTime),
        durationSeconds: hasDuration ? Math.floor(duration) : undefined,
        completed: Boolean(completionSource),
        completionSource,
      });
    },
    [canAccess, completed, isSignedIn, progressPercent, resource, updateProgress],
  );

  const savePdfProgress = useCallback(
    ({ pagesViewed, pageCount }: { pagesViewed: number[]; pageCount: number }) => {
      if (!isSignedIn || !resource || !canAccess || resource.type !== 'pdf') return;
      const viewedPages = [...new Set(pagesViewed)].filter((page) => page > 0 && page <= pageCount).sort((a, b) => a - b);
      const signature = `${pageCount}:${viewedPages.join(',')}`;
      if (lastPdfSignatureRef.current === signature) return;
      const now = Date.now();
      const viewedAllPages = pageCount > 0 && viewedPages.length >= pageCount;
      if (now - lastPdfSaveRef.current < 5_000 && !viewedAllPages) return;
      lastPdfSaveRef.current = now;
      lastPdfSignatureRef.current = signature;
      updateProgress.mutate({
        progressPercent: pageCount > 0 ? Math.round((viewedPages.length / pageCount) * 100) : 0,
        pagesViewed: viewedPages,
        pageCount,
      });
    },
    [canAccess, isSignedIn, resource, updateProgress],
  );

  if (!resource) {
    return (
      <main className="page narrow">
        <p className="muted">Resource not found.</p>
        <a className="secondary-button fit" href="#/dashboard">Back to dashboard</a>
      </main>
    );
  }

  if (!entitlementsLoading && !canAccess) {
    return (
      <main className="page narrow">
        <a className="text-link" href={backHref}><ArrowLeft size={16} /> Back</a>
        <LockedCourseAccess course={getCourseById(resource.courseId)} />
      </main>
    );
  }

  const pdfUrl = resource.type === 'pdf' ? resource.contentUrl ?? publicUrl.data?.url ?? paidUrl.data?.url : null;
  const signedVideoReady = resource.type === 'video' && resource.muxPlaybackId && resource.muxPlaybackSigned && muxToken.data?.token;

  return (
    <main className="page narrow">
      <header className="resource-detail-header">
        <div>
          <a className="text-link" href={backHref}><ArrowLeft size={16} /> Back</a>
          <h1>{resource.title}</h1>
          <p>{resource.description}</p>
        </div>
      </header>

      {isSignedIn && (
        <ProgressControl
          progress={progress}
          busy={completeResource.isPending || incompleteResource.isPending}
          onComplete={() =>
            completeResource.mutate('manual', {
              onSuccess: () => toast.success('Marked complete'),
              onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save progress'),
            })
          }
          onIncomplete={() =>
            incompleteResource.mutate(undefined, {
              onSuccess: () => toast.success('Marked incomplete'),
              onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save progress'),
            })
          }
        />
      )}

      {resource.type === 'video' && (
        <section className="viewer-frame">
          {resource.muxPlaybackSigned && muxToken.isLoading && <p className="viewer-message">Preparing secure playback...</p>}
          {resource.muxPlaybackSigned && muxToken.error && <p className="viewer-message is-error">Unable to load playback token.</p>}
          {(!resource.muxPlaybackSigned || signedVideoReady || resource.contentUrl) && (
            <MuxVideoPlayer
              playbackId={resource.muxPlaybackId}
              playbackToken={muxToken.data?.token}
              contentUrl={resource.contentUrl}
              title={resource.title}
              startTime={!completed ? progress?.lastPositionSeconds : undefined}
              onTimeUpdate={(event) => saveVideoProgress(event)}
              onPause={(event) => saveVideoProgress(event, { force: true })}
              onEnded={(event) => saveVideoProgress(event, { force: true, completionSource: 'video_ended' })}
            />
          )}
        </section>
      )}

      {resource.type === 'pdf' && (
        <section className="viewer-frame">
          {(publicUrl.isLoading || paidUrl.isLoading) && <p className="viewer-message">Preparing document...</p>}
          {(publicUrl.error || paidUrl.error) && <p className="viewer-message is-error">Unable to load PDF.</p>}
          {pdfUrl && <PdfDocumentViewer file={pdfUrl} title={resource.title} onProgress={savePdfProgress} />}
          {!pdfUrl && !publicUrl.isLoading && !paidUrl.isLoading && <p className="viewer-message">No PDF source is configured.</p>}
        </section>
      )}

      {(resource.type === 'article' || resource.type === 'module') && (
        <section className="article-frame">
          <p>{resource.description}</p>
          {resource.contentUrl && <a className="primary-button fit" href={resource.contentUrl} target="_blank" rel="noopener noreferrer">Open Content</a>}
        </section>
      )}
    </main>
  );
}

function ProgressControl({
  progress,
  busy,
  onComplete,
  onIncomplete,
}: {
  progress?: ResourceProgress;
  busy: boolean;
  onComplete: () => void;
  onIncomplete: () => void;
}) {
  const percent = progress?.completed ? 100 : progress?.progressPercent ?? 0;
  return (
    <section className="progress-control">
      <div className="progress-copy">
        <div className="progress-meta">
          <span>Saved progress</span>
          <span>{progress?.completed ? 'Complete' : `${percent}%`}</span>
        </div>
        <ProgressBar value={percent} />
      </div>
      {progress?.completed ? (
        <button className="secondary-button compact" type="button" disabled={busy} onClick={onIncomplete}>
          <Circle size={15} />
          Mark incomplete
        </button>
      ) : (
        <button className="primary-button compact" type="button" disabled={busy} onClick={onComplete}>
          <CheckCircle2 size={15} />
          Mark complete
        </button>
      )}
    </section>
  );
}

function SettingsPage() {
  const { isSignedIn, signIn } = usePortalAuth();
  const { courses, hasCourseAccess, isLoading } = useEntitlements();
  const currentUser = useCurrentUser();
  const redeem = useRedeemAccessCode();
  const [code, setCode] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    redeem.mutate(value, {
      onSuccess: ({ courseId }) => {
        setCode('');
        toast.success(`${getCourseById(courseId)?.title ?? courseId} unlocked`);
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to redeem code'),
    });
  };

  if (!isSignedIn) {
    return (
      <main className="page narrow">
        <section className="empty-state align-left">
          <h1>Sign in required</h1>
          <p>Access-code redemption and saved progress need an account.</p>
          <button className="primary-button fit" type="button" onClick={() => void signIn()}>
            <LogIn size={16} />
            Sign in
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <section className="page-header">
        <p className="eyebrow">Account</p>
        <h1>Settings</h1>
        <p>Manage course access and redeem product codes.</p>
      </section>

      <section className="settings-panel" id="course-access">
        <h2>Course Access</h2>
        <p className="muted">
          Available courses: {isLoading ? 'Loading...' : courses.map((courseId) => getCourseById(courseId)?.title ?? courseId).join(', ')}
        </p>

        {COURSES.filter((course) => !hasCourseAccess(course.id)).length === 0 ? (
          <p className="success-message">All configured courses are unlocked for this account.</p>
        ) : (
          <form className="redeem-form" onSubmit={submit}>
            <label htmlFor="access-code">Redeem Access Code</label>
            <input
              id="access-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={PRODUCT.accessCodePlaceholder}
              autoComplete="off"
              spellCheck={false}
              disabled={redeem.isPending}
            />
            <div className="form-actions">
              <button className="primary-button compact" type="submit" disabled={!code.trim() || redeem.isPending}>
                {redeem.isPending ? 'Redeeming...' : 'Redeem Code'}
              </button>
              <a className="secondary-button compact" href={PRODUCT.checkoutUrl} target="_blank" rel="noopener noreferrer">
                Purchase Access
              </a>
            </div>
            {getAuthMode() === 'mock' && <p className="hint">Mock code: {PRODUCT.mockAccessCode}</p>}
          </form>
        )}
      </section>

      {currentUser.data?.role === 'ADMIN' && (
        <section className="settings-panel">
          <h2>Admin Tools</h2>
          <p className="muted">Add new course resources, edit catalog metadata, or remove resources.</p>
          <a className="primary-button fit" href="#/admin/resources">
            <UploadCloud size={16} />
            Open Resource Manager
          </a>
        </section>
      )}
    </main>
  );
}

function LockedCourseAccess({ course }: { course?: CourseDefinition }) {
  return (
    <section className="locked-panel">
      <LockKeyhole size={22} />
      <div>
        <h2>Unlock {course?.title ?? 'this course'}</h2>
        <p>Purchase access or redeem a product code to view paid videos, PDFs, and module resources.</p>
        <div className="form-actions">
          <a className="primary-button compact" href={PRODUCT.checkoutUrl} target="_blank" rel="noopener noreferrer">Purchase Access</a>
          <a className="secondary-button compact" href="#/settings">Redeem Code</a>
        </div>
      </div>
    </section>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress-bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function courseCompletion(courseId: string, resources: Resource[], progress: ResourceProgress[]) {
  const courseResources = resources.filter((resource) => resource.courseId === courseId);
  const ids = new Set(courseResources.map((resource) => resource.id));
  const completed = progress.filter((row) => row.completed && ids.has(row.resourceId)).length;
  const total = courseResources.length;
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

function tabLabel(tab: CourseTab, selectedModule?: string) {
  if (selectedModule) return `Videos - ${selectedModule}`;
  if (tab === 'videos') return 'Videos';
  if (tab === 'resources') return 'Resources';
  return 'All course content';
}
