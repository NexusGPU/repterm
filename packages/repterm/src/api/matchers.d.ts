/**
 * Matchers interface for type augmentation
 * 
 * Plugins can extend this interface to add custom matchers:
 * 
 * @example
 * declare module 'repterm' {
 *   interface Matchers<R = void> {
 *     toBeRunning(timeout?: number): Promise<R>;
 *   }
 * }
 */

/**
 * Base Matchers interface - can be augmented by plugins
 */
export interface Matchers<R = void> {
  // Base matchers will be added here by core
  // Plugins can augment this interface to add custom matchers
}

/**
 * Asymmetric matchers for expect.anything(), expect.any(), etc.
 */
export interface AsymmetricMatchers {
  // Reserved for future use
}
