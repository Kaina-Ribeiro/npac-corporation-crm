import { Bone, ListSkeleton, PageHeadSkeleton, SkeletonPage } from '@/components/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <PageHeadSkeleton action />
      <Bone className="h-12 w-full rounded-2xl" />
      <ListSkeleton rows={8} />
    </SkeletonPage>
  );
}
