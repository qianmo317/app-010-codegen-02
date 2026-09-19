// 简易前端路由
export type Route = {
  path: string;
  params?: Record<string, string>;
};

type RouteHandler = (route: Route) => void;

class Router {
  private handlers: RouteHandler[] = [];
  private currentRoute: Route = { path: '/' };

  constructor() {
    window.addEventListener('popstate', () => this.notify());
    window.addEventListener('hashchange', () => this.notify());
  }

  onChange(handler: RouteHandler) {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  navigate(path: string) {
    history.pushState({}, '', path);
    this.notify();
  }

  private notify() {
    const path = window.location.pathname;
    const route = this.parsePath(path);
    this.currentRoute = route;
    this.handlers.forEach(h => h(route));
  }

  private parsePath(path: string): Route {
    // 解析 /day/:date 格式
    const dayMatch = path.match(/^\/day\/(\d{4}-\d{2}-\d{2})$/);
    if (dayMatch) {
      return { path: '/day', params: { date: dayMatch[1] } };
    }
    if (path === '/pick') return { path: '/pick' };
    if (path === '/farm') return { path: '/farm' };
    return { path: '/' };
  }

  getCurrentRoute(): Route {
    return this.currentRoute;
  }

  init() {
    this.notify();
  }
}

export const router = new Router();
