import { LoginPage } from '@/components/login-page';

function resolveNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/')) {
    return '/profile';
  }
  return value;
}

type LoginRoutePageProps = {
  searchParams?: Promise<{
    next?: string | string[] | undefined;
  }>;
};

export default async function LoginRoutePage({ searchParams }: LoginRoutePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextValue = Array.isArray(resolvedSearchParams?.next)
    ? resolvedSearchParams?.next[0] ?? null
    : resolvedSearchParams?.next ?? null;

  return <LoginPage nextPath={resolveNextPath(nextValue)} />;
}
