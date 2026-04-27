import { SiteDetailPage } from "@/features/sites/site-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SiteDetailPage id={id} />;
}
