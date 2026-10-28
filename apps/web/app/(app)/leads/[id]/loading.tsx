import { Bone, CardSkeleton, SkeletonPage } from '@/components/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="flex items-center gap-4">
        <Bone className="size-14 flex-none rounded-full" />
        <div className="flex flex-col gap-2">
          <Bone className="h-8 w-56" />
          <Bone className="h-4 w-40" />
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <CardSkeleton className="lg:col-span-2" lines={6} />
        <CardSkeleton lines={4} />
        <CardSkeleton className="lg:col-span-2" lines={4} />
      </div>
    </SkeletonPage>
  );
}
