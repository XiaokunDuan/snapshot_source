'use client';

import { SignIn } from "@clerk/nextjs";
import { LocaleToggle, useMessages } from "@/app/components/LocaleProvider";

export default function SignInPage() {
    const copy = useMessages();

    return (
        <div className="min-h-screen bg-gradient-to-br from-lime-50 via-white to-emerald-50 flex items-center justify-center p-4 transition-colors duration-300">
            <div className="w-full max-w-md">
                <div className="mb-6 flex justify-center">
                    <LocaleToggle />
                </div>
                <div className="text-center mb-8">
                    <img
                        src="/logo.png"
                        alt="Snapshot Logo"
                        className="h-16 mx-auto mb-4"
                    />
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">{copy.auth.signInTitle}</h1>
                    <p className="text-gray-600">{copy.auth.signInDescription.replace(/[。.]$/, '')}</p>
                </div>

                <SignIn
                    path="/sign-in"
                    routing="path"
                    signUpUrl="/sign-up"
                    forceRedirectUrl="/"
                    appearance={{
                        elements: {
                            rootBox: "mx-auto",
                            card: "shadow-xl rounded-3xl border-0 bg-white",
                            headerTitle: "hidden",
                            headerSubtitle: "hidden",
                            socialButtonsBlockButton: "rounded-2xl bg-white border-gray-200 hover:bg-gray-50",
                            formButtonPrimary: "rounded-2xl bg-lime-500 hover:bg-lime-600 text-white",
                            formFieldInput: "rounded-2xl border-gray-200 bg-white text-gray-900 focus:border-lime-500 focus:ring-lime-500",
                            formFieldLabel: "text-gray-700",
                            formFieldHintText: "text-gray-500",
                            identityPreviewText: "text-gray-900",
                            identityPreviewEditButton: "text-lime-600 hover:text-lime-700",
                            dividerLine: "bg-gray-200",
                            dividerText: "text-gray-500",
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
