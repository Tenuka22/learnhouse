import type { SearchMeta } from './types'

import { searchMeta as home } from '@/app/[locale]/orgs/[orgslug]/dash/page.search'
import { searchMeta as courses } from '@/app/[locale]/orgs/[orgslug]/dash/courses/page.search'
import { searchMeta as coursesMigrate } from '@/app/[locale]/orgs/[orgslug]/dash/courses/migrate/page.search'
import { searchMeta as assignments } from '@/app/[locale]/orgs/[orgslug]/dash/assignments/page.search'
import { searchMeta as communities } from '@/app/[locale]/orgs/[orgslug]/dash/communities/page.search'
import { searchMeta as podcasts } from '@/app/[locale]/orgs/[orgslug]/dash/podcasts/page.search'
import { searchMeta as boards } from '@/app/[locale]/orgs/[orgslug]/dash/boards/page.search'
import { searchMeta as playgrounds } from '@/app/[locale]/orgs/[orgslug]/dash/playgrounds/page.search'
import { searchMeta as analytics } from '@/app/[locale]/orgs/[orgslug]/dash/analytics/page.search'
import { searchMetas as users } from '@/app/[locale]/orgs/[orgslug]/dash/users/page.search'
import { searchMetas as org } from '@/app/[locale]/orgs/[orgslug]/dash/org/page.search'
import { searchMetas as payments } from '@/app/[locale]/orgs/[orgslug]/dash/payments/page.search'
import { searchMetas as account } from '@/app/[locale]/orgs/[orgslug]/(withmenu)/account/page.search'

export const dashboardPages: SearchMeta[] = [
  home,
  courses,
  coursesMigrate,
  assignments,
  communities,
  podcasts,
  boards,
  playgrounds,
  analytics,
  ...users,
  ...org,
  ...payments,
  ...account,
]
