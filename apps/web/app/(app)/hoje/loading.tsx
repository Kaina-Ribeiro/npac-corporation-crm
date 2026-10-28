import { ListSkeleton, PageHeadSkeleton, SkeletonPage } from '@/components/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <PageHeadSkeleton />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ListSkeleton rows={4} />
        <ListSkeleton rows={3} />
      </div>
    </SkeletonPage>
  );
}
