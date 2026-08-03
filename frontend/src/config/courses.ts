import type { CourseDefinition } from '../types';

export const PUBLIC_COURSE_IDS = ['course-1'] as const;

export const COURSES: readonly CourseDefinition[] = [
  {
    id: 'course-1',
    title: 'Starter Course',
    shortLabel: 'Course 1',
    description: 'Open lessons and resources for every learner.',
  },
  {
    id: 'course-2',
    title: 'Advanced Course',
    shortLabel: 'Course 2',
    description: 'Paid course content unlocked by entitlement or access code.',
    modules: [
      { id: 'module-1', title: 'Module 1: Foundations' },
      { id: 'module-2', title: 'Module 2: Practice' },
      { id: 'module-3', title: 'Module 3: Feedback' },
      { id: 'module-4', title: 'Module 4: Final Review' },
    ],
  },
] as const;

export function getCourseById(courseId: string): CourseDefinition | undefined {
  return COURSES.find((course) => course.id === courseId);
}

export function isPublicCourse(courseId: string): boolean {
  return (PUBLIC_COURSE_IDS as readonly string[]).includes(courseId);
}
