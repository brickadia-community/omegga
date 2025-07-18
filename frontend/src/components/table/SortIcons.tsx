import { IconSortAscending, IconSortDescending } from '@tabler/icons-react';

export const SortIcons = ({
  name,
  sort,
  direction,
}: {
  name: string;
  sort: string;
  direction: number;
}) =>
  name === sort && (
    <>
      {direction === 1 && <IconSortAscending />}
      {direction === -1 && <IconSortDescending />}
    </>
  );
