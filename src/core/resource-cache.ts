/** Short lived worker memory cache; public responses are not written to disk. */
export class ResourceCache {
  private entries = new Map<
    string,
    { value: unknown; size: number; expires: number }
  >();
  private bytes = 0;
  constructor(
    private budget = 8 * 1024 * 1024,
    private now = () => Date.now(),
  ) {}
  get(key: string): unknown {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.remove(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: unknown, ttl: number) {
    const size =
      (typeof value === "string"
        ? value.length
        : JSON.stringify(value).length) * 2;
    this.remove(key);
    if (size > this.budget) return;
    this.entries.set(key, { value, size, expires: this.now() + ttl });
    this.bytes += size;
    while (this.bytes > this.budget || this.entries.size > 32)
      this.remove(this.entries.keys().next().value!);
  }
  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.size;
    this.entries.delete(key);
  }
}
