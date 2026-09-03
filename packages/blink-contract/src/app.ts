export interface WindowsAppDefinition {
  executableNames: string[];
  knownPaths?: string[];
  aliases?: string[];
}

export interface MacOSAppDefinition {
  bundleIds?: string[];
  appNames?: string[];
  knownPaths?: string[];
}

export interface AppDefinition {
  id: string;
  name: string;
  category?: string;
  description?: string;
  icon?: string;
  platforms: {
    windows?: WindowsAppDefinition;
    macos?: MacOSAppDefinition;
  };
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}
