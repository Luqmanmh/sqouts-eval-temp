import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment } from "react/jsx-runtime";

export function DynamicCrumb({ url }: { url: string }) {
  const split = url.split("/").filter(Boolean);
  const crumbs = [];
  for (let i = 0; i < split.length; i += 2) {
    const resource = split[i];
    const id = split[i + 1];

    crumbs.push({
      label: id ? `${resource} : ${id}` : resource,
      path: "/" + split.slice(0, i + 2).join("/"),
    });
    // console.log(crumbs)
  }

  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={"/scenarios"}>Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {crumbs.map((singles, index) => (
            <Fragment key={index}>
              {index !== crumbs.length - 1 ? (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to={singles.path}>{singles.label}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              ) : (
                <BreadcrumbPage>{singles.label}</BreadcrumbPage>
              )}
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  );
}
