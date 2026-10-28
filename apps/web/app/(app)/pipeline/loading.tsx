import { Bone, PageHeadSkeleton, SkeletonPage } from '@/components/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <PageHeadSkeleton />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }, (_, c) => (
          <div key={c} className="glass-card flex w-72 flex-none flex-col gap-3 p-4">
            <Bone className="h-5 w-32" />
            {Array.from({ length: 4 - (c % 2) }, (_, i) => (
              <Bone key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
