import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit3, FileText, Plus, Save, Trash2, Video } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { usePortalAuth } from '../auth/auth-context';
import { shouldUseMockApiData } from '../auth/env';
import { COURSES } from '../config/courses';
import {
  createAdminResource,
  deleteAdminResource,
  updateAdminResource,
} from '../lib/api';
import type { AdminResourceInput, Resource, ResourceAccess, ResourceType } from '../types';
import { useResources } from '../hooks/use-resources';

const RESOURCE_TYPES: readonly ResourceType[] = ['video', 'pdf', 'article', 'module'];
const ACCESS_OPTIONS: readonly ResourceAccess[] = ['public', 'paid'];

function emptyResourceInput(): AdminResourceInput {
  return {
    title: '',
    courseId: COURSES[0]?.id ?? 'course-1',
    moduleId: null,
    type: 'video',
    topic: '',
    description: '',
    duration: '',
    access: 'public',
    bucket: '',
    filePath: '',
    thumbnailUrl: '',
    contentUrl: '',
    muxPlaybackId: '',
    muxPlaybackSigned: false,
  };
}

function inputFromResource(resource: Resource): AdminResourceInput {
  return {
    title: resource.title,
    courseId: resource.courseId,
    moduleId: resource.moduleId ?? null,
    type: resource.type,
    topic: resource.topic,
    description: resource.description,
    duration: resource.duration ?? '',
    access: resource.access,
    bucket: resource.bucket ?? '',
    filePath: resource.filePath ?? '',
    thumbnailUrl: resource.thumbnailUrl ?? '',
    contentUrl: resource.contentUrl ?? '',
    muxPlaybackId: resource.muxPlaybackId ?? '',
    muxPlaybackSigned: Boolean(resource.muxPlaybackSigned),
  };
}

function cleanResourceInput(input: AdminResourceInput): AdminResourceInput {
  return {
    title: input.title.trim(),
    courseId: input.courseId.trim(),
    moduleId: input.moduleId?.trim() || null,
    type: input.type,
    topic: input.topic.trim(),
    description: input.description.trim(),
    duration: input.duration?.trim() || undefined,
    access: input.access,
    bucket: input.bucket?.trim() || undefined,
    filePath: input.filePath?.trim() || undefined,
    thumbnailUrl: input.thumbnailUrl?.trim() || undefined,
    contentUrl: input.contentUrl?.trim() || undefined,
    muxPlaybackId: input.muxPlaybackId?.trim() || undefined,
    muxPlaybackSigned: Boolean(input.muxPlaybackSigned),
  };
}

function mockResource(input: AdminResourceInput, existing?: Resource): Resource {
  const now = new Date().toISOString();
  return {
    id:
      existing?.id ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `mock-resource-${Date.now()}`),
    title: input.title,
    courseId: input.courseId,
    moduleId: input.moduleId ?? null,
    type: input.type,
    topic: input.topic,
    description: input.description,
    duration: input.duration,
    access: input.access,
    bucket: input.bucket,
    filePath: input.filePath,
    thumbnailUrl: input.thumbnailUrl,
    contentUrl: input.contentUrl,
    muxPlaybackId: input.muxPlaybackId,
    muxPlaybackSigned: input.muxPlaybackSigned,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function ResourceForm({
  label,
  value,
  busy,
  onCancel,
  onChange,
  onSubmit,
}: {
  label: string;
  value: AdminResourceInput;
  busy: boolean;
  onCancel?: () => void;
  onChange: (value: AdminResourceInput) => void;
  onSubmit: () => void;
}) {
  const modules = useMemo(
    () => COURSES.find((course) => course.id === value.courseId)?.modules ?? [],
    [value.courseId],
  );

  const setField = <K extends keyof AdminResourceInput>(field: K, next: AdminResourceInput[K]) => {
    onChange({ ...value, [field]: next });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="admin-resource-form" onSubmit={submit}>
      <div className="form-grid">
        <label>
          <span>Title</span>
          <input
            aria-label="Title"
            required
            value={value.title}
            onChange={(event) => setField('title', event.target.value)}
          />
        </label>

        <label>
          <span>Type</span>
          <select
            aria-label="Type"
            value={value.type}
            onChange={(event) => setField('type', event.target.value as ResourceType)}
          >
            {RESOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Course</span>
          <select
            aria-label="Course"
            value={value.courseId}
            onChange={(event) =>
              onChange({ ...value, courseId: event.target.value, moduleId: null })
            }
          >
            {COURSES.map((course) => (
              <option key={course.id} value={course.id}>
                {course.shortLabel}: {course.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Module</span>
          <select
            aria-label="Module"
            value={value.moduleId ?? ''}
            onChange={(event) => setField('moduleId', event.target.value || null)}
          >
            <option value="">No module</option>
            {modules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Access</span>
          <select
            aria-label="Access"
            value={value.access}
            onChange={(event) => setField('access', event.target.value as ResourceAccess)}
          >
            {ACCESS_OPTIONS.map((access) => (
              <option key={access} value={access}>
                {access}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Topic</span>
          <input
            aria-label="Topic"
            required
            value={value.topic}
            onChange={(event) => setField('topic', event.target.value)}
          />
        </label>

        <label>
          <span>Duration</span>
          <input
            aria-label="Duration"
            value={value.duration ?? ''}
            placeholder="12 min or 24 pages"
            onChange={(event) => setField('duration', event.target.value)}
          />
        </label>

        <label>
          <span>Content URL</span>
          <input
            aria-label="Content URL"
            value={value.contentUrl ?? ''}
            placeholder="Public article, MP4, or PDF URL"
            onChange={(event) => setField('contentUrl', event.target.value)}
          />
        </label>

        <label>
          <span>Storage Bucket</span>
          <input
            aria-label="Storage Bucket"
            value={value.bucket ?? ''}
            placeholder="resources-public or resources-paid"
            onChange={(event) => setField('bucket', event.target.value)}
          />
        </label>

        <label>
          <span>Storage Path</span>
          <input
            aria-label="Storage Path"
            value={value.filePath ?? ''}
            placeholder="course-2/module-1/workbook.pdf"
            onChange={(event) => setField('filePath', event.target.value)}
          />
        </label>

        <label>
          <span>Mux Playback ID</span>
          <input
            aria-label="Mux Playback ID"
            value={value.muxPlaybackId ?? ''}
            placeholder="Mux playback ID"
            onChange={(event) => setField('muxPlaybackId', event.target.value)}
          />
        </label>

        <label>
          <span>Thumbnail URL</span>
          <input
            aria-label="Thumbnail URL"
            value={value.thumbnailUrl ?? ''}
            placeholder="Optional card thumbnail"
            onChange={(event) => setField('thumbnailUrl', event.target.value)}
          />
        </label>
      </div>

      <label className="checkbox-row">
        <input
          aria-label="Require signed Mux playback token"
          type="checkbox"
          checked={Boolean(value.muxPlaybackSigned)}
          onChange={(event) => setField('muxPlaybackSigned', event.target.checked)}
        />
        <span>Require signed Mux playback token</span>
      </label>

      <label>
        <span>Description</span>
        <textarea
          aria-label="Description"
          rows={4}
          value={value.description}
          onChange={(event) => setField('description', event.target.value)}
        />
      </label>

      <div className="form-actions">
        <button className="primary-button compact" type="submit" disabled={busy}>
          {label === 'Create Resource' ? <Plus size={15} /> : <Save size={15} />}
          {busy ? 'Saving...' : label}
        </button>
        {onCancel && (
          <button className="secondary-button compact" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function AdminResourceManager() {
  const { getToken } = usePortalAuth();
  const queryClient = useQueryClient();
  const { resources, isLoading, error } = useResources();
  const [draft, setDraft] = useState<AdminResourceInput>(() => emptyResourceInput());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AdminResourceInput>(() => emptyResourceInput());
  const mockMode = shouldUseMockApiData();

  useEffect(() => {
    if (!editingId) return;
    const resource = resources.find((item) => item.id === editingId);
    if (resource) setEditDraft(inputFromResource(resource));
  }, [editingId, resources]);

  const updateResourcesCache = (updater: (resources: Resource[]) => Resource[]) => {
    queryClient.setQueriesData<Resource[]>({ queryKey: ['resources'] }, (current) =>
      updater(current ?? []),
    );
  };

  const createMutation = useMutation({
    mutationFn: async (input: AdminResourceInput) => {
      const cleaned = cleanResourceInput(input);
      if (mockMode) return mockResource(cleaned);
      return createAdminResource(cleaned, getToken);
    },
    onSuccess: async (resource) => {
      updateResourcesCache((current) => [resource, ...current]);
      if (!mockMode) await queryClient.invalidateQueries({ queryKey: ['resources'] });
      setDraft(emptyResourceInput());
      toast.success('Resource added');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Unable to add resource');
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: AdminResourceInput }) => {
      const cleaned = cleanResourceInput(input);
      const existing = resources.find((item) => item.id === id);
      if (mockMode) return mockResource(cleaned, existing);
      return updateAdminResource(id, cleaned, getToken);
    },
    onSuccess: async (resource) => {
      updateResourcesCache((current) =>
        current.map((item) => (item.id === resource.id ? resource : item)),
      );
      if (!mockMode) await queryClient.invalidateQueries({ queryKey: ['resources'] });
      setEditingId(null);
      toast.success('Resource updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Unable to update resource');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (resourceId: string) => {
      if (mockMode) return null;
      return deleteAdminResource(resourceId, getToken);
    },
    onSuccess: async (_result, resourceId) => {
      updateResourcesCache((current) => current.filter((item) => item.id !== resourceId));
      if (!mockMode) await queryClient.invalidateQueries({ queryKey: ['resources'] });
      toast.success('Resource deleted');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Unable to delete resource');
    },
  });

  const sortedResources = useMemo(
    () =>
      [...resources].sort(
        (a, b) =>
          a.courseId.localeCompare(b.courseId) ||
          (a.moduleId ?? '').localeCompare(b.moduleId ?? '') ||
          a.title.localeCompare(b.title),
      ),
    [resources],
  );

  return (
    <main className="page">
      <section className="page-header">
        <p className="eyebrow">Admin</p>
        <h1>Resource Manager</h1>
        <p>Add, edit, and remove course resources from the reusable catalog.</p>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>New Resource</h2>
          <p>
            Use `contentUrl` for quick mock testing, `bucket` and `filePath` for Supabase PDFs, or
            `muxPlaybackId` for Mux videos.
          </p>
        </div>
        <ResourceForm
          label="Create Resource"
          value={draft}
          busy={createMutation.isPending}
          onChange={setDraft}
          onSubmit={() => createMutation.mutate(draft)}
        />
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Catalog</h2>
          <p>{isLoading ? 'Loading resources...' : `${resources.length} resources configured`}</p>
        </div>

        {error && (
          <p className="error" role="alert">
            {error instanceof Error ? error.message : 'Unable to load resources'}
          </p>
        )}

        <div className="admin-resource-list">
          {sortedResources.map((resource) => (
            <article key={resource.id} className="admin-resource-row">
              {editingId === resource.id ? (
                <ResourceForm
                  label="Save Resource"
                  value={editDraft}
                  busy={editMutation.isPending}
                  onChange={setEditDraft}
                  onCancel={() => setEditingId(null)}
                  onSubmit={() => editMutation.mutate({ id: resource.id, input: editDraft })}
                />
              ) : (
                <>
                  <div className="admin-resource-icon" aria-hidden>
                    {resource.type === 'video' ? <Video size={18} /> : <FileText size={18} />}
                  </div>
                  <div className="admin-resource-copy">
                    <strong>{resource.title}</strong>
                    <span>
                      {resource.courseId}
                      {resource.moduleId ? ` / ${resource.moduleId}` : ''} / {resource.type} /{' '}
                      {resource.access}
                    </span>
                    <p>{resource.description || 'No description'}</p>
                  </div>
                  <div className="admin-row-actions">
                    <button
                      className="secondary-button compact"
                      type="button"
                      onClick={() => {
                        setEditingId(resource.id);
                        setEditDraft(inputFromResource(resource));
                      }}
                    >
                      <Edit3 size={15} />
                      Edit
                    </button>
                    <button
                      className="danger-button compact"
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete "${resource.title}"?`)) {
                          deleteMutation.mutate(resource.id);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
