export type Locale = 'zh-CN' | 'en';

type Messages = {
  appName: string;
  appTagline: string;
  languageLabel: string;
  actions: {
    signIn: string;
    signUp: string;
    startFreeTrial: string;
    processing: string;
  };
  landing: {
    badge: string;
    title: string;
    description: string;
    monthlyPrice: string;
    trialLabel: string;
    trialLength: string;
    quotaLabel: string;
    quotaValue: string;
    proTitle: string;
    freeTrialBadge: string;
    subtotal: string;
    trialCharge: string;
    todayDue: string;
    resetFeature: string;
    monitoringFeature: string;
  };
  auth: {
    signInTitle: string;
    signInDescription: string;
    signUpTitle: string;
    signUpDescription: string;
  };
  billing: {
    title: string;
    subtitle: string;
    unavailableTitle: string;
    initializing: string;
    freeTrialBadge: string;
    subtotal: string;
    trialCharge: string;
    todayDue: string;
  };
};

export const DEFAULT_LOCALE: Locale = 'zh-CN';

export const messages: Record<Locale, Messages> = {
  'zh-CN': {
    appName: 'Snapshot',
    appTagline: '用图片驱动英语学习',
    languageLabel: '语言',
    actions: {
      signIn: '登录',
      signUp: '注册',
      startFreeTrial: '开始免费试用',
      processing: '处理中...',
    },
    landing: {
      badge: '3 天免费试用，之后 $9.90/月',
      title: '把任意一张照片，变成值得记住的单词。',
      description: 'Snapshot 用图片驱动词汇学习，自动提取单词、音标、释义和例句。每月包含 100 次 AI 图片识别额度。',
      monthlyPrice: '月费',
      trialLabel: '试用期',
      trialLength: '3 天',
      quotaLabel: '月度额度',
      quotaValue: '100 次',
      proTitle: 'Snapshot Pro',
      freeTrialBadge: '免费试用',
      subtotal: '小计',
      trialCharge: '试用 3 天后付费总额',
      todayDue: '今日应付',
      resetFeature: '图片分析额度按月重置',
      monitoringFeature: '线上错误和支付失败链路都有监控',
    },
    auth: {
      signInTitle: '欢迎回来',
      signInDescription: '登录继续你的学习之旅',
      signUpTitle: '开始学习',
      signUpDescription: '创建账号，开启英语学习新旅程',
    },
    billing: {
      title: '结账',
      subtitle: '今天先锁定 3 天免费试用，之后按月收费。',
      unavailableTitle: '结账暂时不可用',
      initializing: '正在初始化结账...',
      freeTrialBadge: '免费试用',
      subtotal: '小计',
      trialCharge: '试用 3 天后付费总额',
      todayDue: '今日应付',
    },
  },
  en: {
    appName: 'Snapshot',
    appTagline: 'Photo-powered English learning',
    languageLabel: 'Language',
    actions: {
      signIn: 'Sign in',
      signUp: 'Sign up',
      startFreeTrial: 'Start free trial',
      processing: 'Processing...',
    },
    landing: {
      badge: '3-day free trial, then $9.90/month',
      title: 'Turn any photo into a word worth remembering.',
      description: 'Snapshot turns photos into vocabulary study, extracting words, phonetics, definitions, and example sentences. Every month includes 100 AI image analysis credits.',
      monthlyPrice: 'Monthly price',
      trialLabel: 'Trial',
      trialLength: '3 days',
      quotaLabel: 'Monthly credits',
      quotaValue: '100 analyses',
      proTitle: 'Snapshot Pro',
      freeTrialBadge: 'Free trial',
      subtotal: 'Subtotal',
      trialCharge: 'Charged after 3-day trial',
      todayDue: 'Due today',
      resetFeature: 'Image analysis credits reset every month',
      monitoringFeature: 'Production errors and payment failures are monitored',
    },
    auth: {
      signInTitle: 'Welcome back',
      signInDescription: 'Sign in to continue your learning streak',
      signUpTitle: 'Start learning',
      signUpDescription: 'Create your account and begin a sharper English workflow',
    },
    billing: {
      title: 'Checkout',
      subtitle: 'Lock in your 3-day free trial today, then switch to monthly billing.',
      unavailableTitle: 'Checkout is temporarily unavailable',
      initializing: 'Initializing checkout...',
      freeTrialBadge: 'Free trial',
      subtotal: 'Subtotal',
      trialCharge: 'Charged after 3-day trial',
      todayDue: 'Due today',
    },
  },
};

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'zh-CN' || value === 'en';
}

export function resolveLocale(input?: string | null): Locale {
  if (isLocale(input)) {
    return input;
  }

  if (input?.toLowerCase().startsWith('zh')) {
    return 'zh-CN';
  }

  if (input?.toLowerCase().startsWith('en')) {
    return 'en';
  }

  return DEFAULT_LOCALE;
}

export function getMessages(locale: Locale) {
  return messages[locale];
}
