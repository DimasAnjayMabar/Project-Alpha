# storage/service/exceptions.py

class StorageException(Exception):
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class ValidationError(StorageException):
    def __init__(self, message: str):
        super().__init__(message, status_code=400)


class FileTooLargeError(StorageException):
    def __init__(self, message: str):
        super().__init__(message, status_code=413)


class UnsupportedMediaError(StorageException):
    def __init__(self, message: str):
        super().__init__(message, status_code=415)


class NotFoundError(StorageException):
    def __init__(self, message: str):
        super().__init__(message, status_code=404)