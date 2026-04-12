import StoreKit
import SwiftUI

struct StoreKitRuntimePanel: View {
    @ObservedObject var runtime: SnapshotStoreKitRuntime

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            FeatureBlock(
                title: runtime.subscriptionSurfaceTitle,
                subtitle: runtime.subscriptionSurfaceSubtitle,
                systemImage: runtime.subscriptionSurfaceSystemImage
            )

            if runtime.isLoadingProducts {
                ProgressView("Loading App Store products...")
            }

            if !runtime.products.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Loaded Products")
                        .font(.headline)

                    ForEach(runtime.products) { product in
                        Button {
                            runtime.select(productID: product.id)
                        } label: {
                            StoreKitProductRow(
                                summary: product,
                                isSelected: runtime.selectedProductSummary?.id == product.id
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                FeatureBlock(
                    title: runtime.loadState.title,
                    subtitle: runtime.loadState.detail,
                    systemImage: runtime.loadState.systemImage
                )
            }

            if let selectedProduct = runtime.selectedProductSummary {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Selected Product")
                        .font(.headline)

                    FeatureBlock(
                        title: selectedProduct.displayName,
                        subtitle: selectedProduct.subtitle,
                        systemImage: "cart"
                    )

                    HStack(spacing: 12) {
                        Button(runtime.isPurchasing ? "Purchasing..." : "Buy \(selectedProduct.displayName)") {
                            Task {
                                await runtime.purchaseSelectedProduct()
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(!runtime.canPurchaseSelectedProduct)

                        Button(runtime.isRestoringPurchases ? "Restoring..." : "Restore Purchases") {
                            Task {
                                await runtime.restorePurchases()
                            }
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(runtime.isPurchasing || runtime.isLoadingProducts)
                    }
                }
            }

            HStack(spacing: 12) {
                Button(runtime.isLoadingProducts ? "Refreshing..." : "Refresh Products") {
                    Task {
                        await runtime.refreshRuntime()
                    }
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(runtime.isLoadingProducts)

                if let manageSubscriptionsURL = runtime.manageSubscriptionsURL {
                    Link(destination: manageSubscriptionsURL) {
                        Label("Manage Subscriptions", systemImage: "arrow.up.right.square")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }

            if let lastErrorMessage = runtime.lastErrorMessage, !lastErrorMessage.isEmpty {
                FeatureBlock(
                    title: "StoreKit Message",
                    subtitle: lastErrorMessage,
                    systemImage: "exclamationmark.triangle"
                )
            }

            FeatureBlock(
                title: "Runtime Config",
                subtitle: runtime.configurationSummary,
                systemImage: "slider.horizontal.3"
            )
        }
    }
}

private struct StoreKitProductRow: View {
    let summary: SnapshotStoreKitProductSummary
    let isSelected: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundStyle(isSelected ? Color(red: 0.08, green: 0.36, blue: 0.27) : .secondary)
                .frame(width: 24, height: 24)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(summary.displayName)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Spacer()
                    Text(summary.displayPrice)
                        .font(.headline)
                        .foregroundStyle(.primary)
                }

                Text(summary.subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Text(summary.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(isSelected ? Color(red: 0.08, green: 0.36, blue: 0.27).opacity(0.08) : Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(isSelected ? Color(red: 0.08, green: 0.36, blue: 0.27).opacity(0.35) : Color.black.opacity(0.08), lineWidth: 1)
        )
    }
}
