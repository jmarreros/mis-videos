import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';
import { Link } from '@inertiajs/react';
import { Fragment } from 'react';

export function Breadcrumbs({ breadcrumbs }: { breadcrumbs: BreadcrumbItemType[] }) {
    if (breadcrumbs.length === 0) return null;

    return (
        <Breadcrumb>
            <BreadcrumbList className="flex-nowrap">
                {breadcrumbs.map((item, index) => {
                    const isLast = index === breadcrumbs.length - 1;
                    // On small screens only the parent and the current page are shown.
                    const hideOnMobile = index < breadcrumbs.length - 2;
                    return (
                        <Fragment key={index}>
                            <BreadcrumbItem className={cn('min-w-0', hideOnMobile && 'hidden md:inline-flex')}>
                                {isLast ? (
                                    <BreadcrumbPage className="truncate font-medium">{item.title}</BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink asChild className="truncate">
                                        <Link href={item.href}>{item.title}</Link>
                                    </BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                            {!isLast && <BreadcrumbSeparator className={cn(hideOnMobile && 'hidden md:block')} />}
                        </Fragment>
                    );
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
}
