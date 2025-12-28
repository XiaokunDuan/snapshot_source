import { Skeleton } from "@/components/ui/skeleton"

export const HomeSkeleton = () => {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                </div>
                <Skeleton className="w-20 h-8 rounded-full" />
            </div>

            {/* Challenge Card Skeleton */}
            <div className="aspect-[4/3] w-full rounded-3xl bg-gray-200 dark:bg-gray-800" />

            {/* Calendar Skeleton */}
            <div className="h-64 w-full rounded-3xl bg-gray-200 dark:bg-gray-800" />
        </div>
    )
}
