import { NavHeader } from '../components/navbar';
import { Page, PageContent } from '../components/page';
import { SideNav } from '../components/sidenav';

export const NotFound = () => (
  <Page>
    <NavHeader title="Not Found" />
    <PageContent>
      <SideNav />
    </PageContent>
  </Page>
);
