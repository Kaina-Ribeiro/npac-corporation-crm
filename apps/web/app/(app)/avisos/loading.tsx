import { ListSkeleton, PageHeadSkeleton, SkeletonPage } from '@/components/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <PageHeadSkeleton />
      <ListSkeleton rows={6} />
    </SkeletonPage>
  );
}
