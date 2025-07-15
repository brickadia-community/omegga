import type React from 'react';
import { Background } from '../background';

export const PageContent = ({ children }: React.PropsWithChildren) => (
  <div className="main-content">{children}</div>
);

export const Page = ({
  children,
  loading,
}: React.PropsWithChildren<{ loading?: boolean }>) => (
  <div>
    <Background />
    <div className="content-parent">
      {!loading && <div className="content">{children}</div>}
    </div>
  </div>
);
