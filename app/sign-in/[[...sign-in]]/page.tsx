import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-lime-50 via-white to-emerald-50 dark:from-[#11161c] dark:via-[#0e1217] dark:to-[#16211a] flex items-center justify-center p-4 transition-colors duration-300">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <img
                        src="/logo.png"
                        alt="Snapshot Logo"
                        className="h-16 mx-auto mb-4"
                    />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">欢迎回来</h1>
                    <p className="text-gray-600 dark:text-gray-300">登录继续你的学习之旅</p>
                </div>

                <SignIn
                    path="/sign-in"
                    routing="path"
                    signUpUrl="/sign-up"
                    forceRedirectUrl="/"
                    appearance={{
                        elements: {
                            rootBox: "mx-auto",
                            card: "shadow-xl rounded-3xl border-0 bg-white dark:bg-[#1c232b]",
                            headerTitle: "hidden",
                            headerSubtitle: "hidden",
                            socialButtonsBlockButton: "rounded-2xl bg-white dark:bg-[#11161c] border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5",
                            formButtonPrimary: "rounded-2xl bg-lime-500 hover:bg-lime-600 text-white",
                            formFieldInput: "rounded-2xl border-gray-200 dark:border-white/10 bg-white dark:bg-[#11161c] text-gray-900 dark:text-white focus:border-lime-500 focus:ring-lime-500",
                            formFieldLabel: "text-gray-700 dark:text-gray-300",
                            formFieldHintText: "text-gray-500 dark:text-gray-400",
                            identityPreviewText: "text-gray-900 dark:text-white",
                            identityPreviewEditButton: "text-lime-600 hover:text-lime-700",
                            dividerLine: "bg-gray-200 dark:bg-white/10",
                            dividerText: "text-gray-500 dark:text-gray-400",
                            footerActionLink: "text-lime-600 hover:text-lime-700",
                            footer: "hidden",
                            badge: "hidden"
                        }
                    }}
                />
            </div>
        </div>
    );
}
