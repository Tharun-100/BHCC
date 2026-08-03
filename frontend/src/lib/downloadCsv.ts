export const downloadCsv = (filename: string, rows: Array<Array<string | number>>) => {
  const escapeCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
