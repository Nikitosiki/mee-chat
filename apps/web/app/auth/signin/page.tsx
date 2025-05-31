import { getProviders } from "next-auth/react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "server/auth";
import { redirect } from "next/navigation";
import { LoginButton } from "./page.client";
import { BackgroundGradientAnimation } from "ui/components/background-gradient-animation";

const BackgroundGradientAnimationProps = {
  gradientBackgroundStart: "rgb(0, 12, 34)",
  gradientBackgroundEnd: "rgb(0, 17, 82)",
  firstColor: "73, 137, 245",
  secondColor: "120, 73, 245",
  thirdColor: "73, 82, 245",
  fourthColor: "73, 191, 245",
  fifthColor: "169, 55, 245",
  pointerColor: "140, 100, 255",
  size: "80%",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect(searchParams.callbackUrl ?? "/");
  }

  const providers = await getProviders().then((res) =>
    Object.values(res ?? {})
  );

  return (
    <div className="min-h-screen w-full">
      <BackgroundGradientAnimation
        {...BackgroundGradientAnimationProps}
        className="absolute inset-0 p-4 z-10 flex flex-col items-center justify-center"
      >
        <div className="flex flex-col gap-2 sm:gap-4 text-center p-6 max-w-lg border-[1px] rounded-xl bg-card/50 shadow-lg">
          <h1 className="text-xl font-bold">Login to Mee</h1>
          <p className="mb-2 text-muted-foreground text-sm">
            Login or register an account to start your life on Mee Chat
          </p>
          {providers?.map((provider) => (
            <LoginButton
              key={provider.id}
              provider={provider}
              callbackUrl={searchParams.callbackUrl}
            />
          ))}
        </div>
      </BackgroundGradientAnimation>
    </div>
  );
}
