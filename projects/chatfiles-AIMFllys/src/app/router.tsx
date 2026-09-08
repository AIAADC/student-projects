import { Navigate, type RouteObject } from 'react-router-dom'
import App from '../App'
import { APP_ROUTES, pathForTab, type Tab } from './navigation'
import { RoutePage } from './routePages'

function pageRoute(page: Tab, path: string): RouteObject {
  const element = <RoutePage page={page} />
  return path === '/' ? { index: true, element } : { path: path.slice(1), element }
}

export const appRoutes: RouteObject[] = [{
  path: '/',
  element: <App />,
  children: [
    ...APP_ROUTES.map(({ page, path }) => pageRoute(page, path)),
    { path: 'settings', element: <Navigate replace to={pathForTab('summary')} /> },
    { path: '*', element: <Navigate replace to={pathForTab('overview')} /> },
  ],
}]
