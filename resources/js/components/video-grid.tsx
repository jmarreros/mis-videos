export function VideoGrid({ children }: { children: React.ReactNode }) {
    return <div className="grid grid-cols-1 gap-x-5 gap-y-8 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5">{children}</div>;
}
