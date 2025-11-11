"use client";

import { useParams } from "next/navigation";
import NodePage from "../../page";

export default function LessonPage() {
  const params = useParams<{ slug: string; name: string; idx: string }>();
  const lessonIndex = Number(params.idx || 0);
  
  return <NodePage lessonIndexFromUrl={lessonIndex} />;
}
