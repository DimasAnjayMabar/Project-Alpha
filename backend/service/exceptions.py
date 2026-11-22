class ServiceException(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)

class NotFoundError(ServiceException):
    def __init__(self, message: str = "Data tidak ditemukan"):
        super().__init__(message, status_code=404)

class UnauthorizedError(ServiceException):
    def __init__(self, message: str = "Akses ditolak. Silakan login."):
        super().__init__(message, status_code=401)

class ValidationError(ServiceException):
    def __init__(self, message: str):
        super().__init__(message, status_code=422)