'use client'
import React from 'react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourseRights } from '@components/Hooks/useCourseRights'

interface AuthenticatedClientElementProps {
  children: React.ReactNode
  checkMethod: 'authentication' | 'roles'
  orgId?: string | number
  ressourceType?:
    | 'folders'
    | 'media'
    | 'courses'
    | 'activities'
    | 'users'
    | 'organizations'
    | 'communities'
    | 'discussions'
    | 'podcasts'
    | 'boards'
    | 'playgrounds'
  action?: 'create' | 'update' | 'delete' | 'read'
  /**
   * Opt in to ownership-aware gating for a single course.
   *
   * The plain role check only ever reads `action_<x>`, so a role that grants
   * `action_update_own` but not `action_update` (the default Instructor) was
   * denied the edit affordance on its OWN courses - teachers could create a
   * course and then not manage it. Supplying the course uuid lets an
   * `action_<x>_own` grant resolve against the server-computed ownership from
   * GET /courses/{uuid}/rights, which mirrors the backend's own
   * authorship-tier check. Without this prop behaviour is unchanged.
   *
   * This only reveals UI the backend already permits; it is not a grant.
   */
  courseUuid?: string
}

// Actions that map onto a course-right permission of the same name.
const _COURSE_RIGHT_ACTIONS = new Set(['update', 'delete', 'read'])

export const AuthenticatedClientElement = (
  props: AuthenticatedClientElementProps
) => {
  const [isAllowed, setIsAllowed] = React.useState(false)
  const session = useLHSession() as any
  const org = useOrg() as any
  // Disabled (and inert) when courseUuid is empty, so this costs nothing on
  // every other surface that does not opt in.
  const courseRights = useCourseRights(props.courseUuid ?? '')

  function isUserAllowed(
    roles: any[],
    action: string,
    resourceType: string,
    org_uuid: string
  ): boolean {
    if (!Array.isArray(roles)) {
      return false
    }

    for (const role of roles) {
      // Check if the role is for the right organization
      if (role.org.org_uuid === org_uuid) {
        // Check if the user has the role for the resource type
        if (role.role.rights && role.role.rights[resourceType]) {
          // Check if the user is allowed to execute the action
          const actionKey = `action_${action}`
          if (role.role.rights[resourceType][actionKey] === true) {
            return true
          }
        }
      }
    }

    // If no role matches the organization, resource type, and action, return false
    return false
  }

  function check() {
    if (session.status == 'unauthenticated') {
      setIsAllowed(false)
      return
    } else {
      if (props.checkMethod === 'authentication') {
        setIsAllowed(session.status == 'authenticated')
      } else if (props.checkMethod === 'roles' ) {
        // Superadmins bypass all role checks
        if (session?.data?.user?.is_superadmin === true) {
          return setIsAllowed(true)
        }
        return setIsAllowed(
          isUserAllowed(
            session?.data?.roles,
            props.action!,
            props.ressourceType!,
            org?.org_uuid
          ) || isAllowedByCourseOwnership()
        )
      }
    }
  }

  /**
   * Fallback for a single course: ask the server what this user may do with it.
   * Reached only when the flat role check said no and the caller opted in with
   * `courseUuid`.
   */
  function isAllowedByCourseOwnership(): boolean {
    if (!props.courseUuid) return false
    if (!props.action || !_COURSE_RIGHT_ACTIONS.has(props.action)) return false
    if (props.ressourceType !== 'courses') return false
    return courseRights.rights?.permissions?.[props.action as 'update' | 'delete' | 'read'] === true
  }

  React.useEffect(() => {
    if (session.status == 'loading') {
      return
    }

    check()
  }, [session.data, org, courseRights.rights])

  return <>{isAllowed && props.children}</>
}

export default AuthenticatedClientElement
