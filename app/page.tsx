import RoomPreview from '@/components/ui/RoomPreview';
export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === 'bike' ? 'bike' : 'home';
  return <main className="relative h-dvh overflow-hidden bg-[#15191b] text-white"><RoomPreview key={view} view={view} /></main>;
}
