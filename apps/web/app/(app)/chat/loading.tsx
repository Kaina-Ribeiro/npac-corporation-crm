import { Bone, SkeletonPage } from '@/components/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <Bone className="h-9 w-40" />
      <div className="glass-card flex min-h-[60dvh] flex-col justify-end gap-4 p-5">
        {['w-3/5', 'w-2/5', 'w-3/4', 'w-1/2'].map((w, i) => (
          <div key={i} className={`flex flex-col gap-1.5 ${i % 2 ? 'items-end' : ''}`}>
            <Bone className="h-3 w-24" />
            <Bone className={`h-10 rounded-2xl ${w}`} />
          </div>
        ))}
        <Bone className="h-12 w-full rounded-full" />
      </div>
    </SkeletonPage>
  );
}
