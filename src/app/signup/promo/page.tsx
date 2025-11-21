import LoginPage from "@/components/LoginPage";

type PromoPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function SignupPromoRoute({ searchParams }: PromoPageProps) {
  const initialCode =
    typeof searchParams?.code === "string" ? searchParams.code : "";

  return (
    <LoginPage defaultMode="signup" defaultShowCode defaultCode={initialCode} />
  );
}



