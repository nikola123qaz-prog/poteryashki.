import bridge from "@vkontakte/vk-bridge";

// Safe to initialize in VK Mini Apps; during local preview it may be unavailable.
export async function initVK() {
  try {
    await bridge.send("VKWebAppInit");
    return true;
  } catch {
    return false;
  }
}

export async function getVKUser() {
  try {
    return await bridge.send("VKWebAppGetUserInfo");
  } catch {
    return null;
  }
}