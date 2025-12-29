import { SignUp } from "@clerk/nextjs";
import { zhCN } from "@clerk/localizations";

export default function SignUpPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-lime-50 via-white to-emerald-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <img
                        src="/logo.png"
                        alt="Snapshot Logo"
                        className="h-16 mx-auto mb-4"
                    />
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">开始学习</h1>
                    <p className="text-gray-600">创建账号，开启英语学习新旅程</p>
                </div>

                <SignUp

                    appearance={{
                        elements: {
                            rootBox: "mx-auto",
                            card: "shadow-xl rounded-3xl border-0",
                            headerTitle: "hidden",
                            headerSubtitle: "hidden",
                            socialButtonsBlockButton: "rounded-2xl bg-white border-gray-200 hover:bg-gray-50",
                            formButtonPrimary: "rounded-2xl bg-lime-500 hover:bg-lime-600 text-white",
                            formFieldInput: "rounded-2xl border-gray-200 focus:border-lime-500 focus:ring-lime-500",
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
