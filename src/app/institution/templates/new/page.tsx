import { TemplateEditor } from "@/components/templates/TemplateEditor";

export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { starter } = await searchParams;
  return <TemplateEditor starterId={typeof starter === "string" ? starter : undefined} />;
}
