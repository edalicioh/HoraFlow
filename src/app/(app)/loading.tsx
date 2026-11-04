export default function AppLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-muted" />
      <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />
      <span className="sr-only">Carregando conteúdo</span>
    </div>
  );
}
