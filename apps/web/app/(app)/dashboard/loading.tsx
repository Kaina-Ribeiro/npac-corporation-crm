import { Bone, CardSkeleton, PageHeadSkeleton, SkeletonPage } from '@/components/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <PageHeadSkeleton action />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="glass-card flex flex-col gap-2 p-5">
            <Bone className="h-4 w-24" />
            <Bone className="h-8 w-32" />
            <Bone className="h-3 w-40" />
            <Bone className="mt-2 h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="skeleton min-h-72 rounded-[28px] lg:col-span-2" aria-hidden="true" />
        <CardSkeleton lines={6} />
        <CardSkeleton className="lg:col-span-2" lines={5} />
        <CardSkeleton lines={5} />
      </div>
    </SkeletonPage>
  );
}
