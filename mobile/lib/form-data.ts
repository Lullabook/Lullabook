/** React Native FormData file part (not a web Blob). */
export interface NativeUploadFile {
  uri: string;
  name: string;
  type: string;
}

export function appendNativeFile(form: FormData, key: string, file: NativeUploadFile): void {
  form.append(key, {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
}

export function setNativeFile(form: FormData, key: string, file: NativeUploadFile): void {
  form.set(key, {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
}
